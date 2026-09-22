//! The gallery build: `gallery_gen <ui_dir> <icons_dir> <runtime_dir> <jit_wasm> <preflight_css> <out_dir>`.
//!
//! Lowers every `.ptsx` and `.ts` under `<ui_dir>/src` and `<ui_dir>/gallery`
//! and the icon set's `src/index.ts` through the DOM target into ES modules,
//! keeping the directory shape so the relative imports the compiler rewrites
//! keep resolving. Copies the browser runtime and the jit engine beside them,
//! writes the recipe manifest the app imports, and an `index.html` whose
//! import map resolves the bare `publr` specifiers to those files.
//!
//! Run from `zig build gallery`; no node anywhere.
const std = @import("std");
const pjsx = @import("pjsx");

const file_bytes_max = 4 << 20;
const runtime_import = "publr-jsx";

const Export = struct { name: []const u8, path: []const u8 };

const Gen = struct {
    arena: std.mem.Allocator,
    io: std.Io,
    out: std.Io.Dir,
    recipes: std.ArrayList([]const u8) = .empty,
    components: std.ArrayList([]const u8) = .empty,
    /// Exported component names per lowered component module, for the registry.
    exports: std.ArrayList(Export) = .empty,
    /// Every lowered module, for the shell's preload hints.
    modules: std.ArrayList([]const u8) = .empty,
    lowered: u32 = 0,
    failures: u32 = 0,
};

pub fn main(init: std.process.Init) u8 {
    return run(init) catch |err| {
        std.debug.print("gallery_gen: {s}\n", .{@errorName(err)});
        return 1;
    };
}

fn usage() u8 {
    std.debug.print("usage: gallery_gen <ui_dir> <icons_dir> <runtime_dir> <jit_wasm> <preflight_css> <out_dir>\n", .{});
    return 2;
}

fn run(init: std.process.Init) !u8 {
    const arena = init.arena.allocator();
    const io = init.io;
    var args = try init.minimal.args.iterateAllocator(arena);
    _ = args.next();
    const ui_dir = args.next() orelse return usage();
    const icons_dir = args.next() orelse return usage();
    const runtime_dir = args.next() orelse return usage();
    const jit_wasm = args.next() orelse return usage();
    const preflight_css = args.next() orelse return usage();
    const out_dir_path = args.next() orelse return usage();
    if (args.next() != null) return usage();

    const cwd = std.Io.Dir.cwd();
    try cwd.createDirPath(io, out_dir_path);
    var gen: Gen = .{ .arena = arena, .io = io, .out = try cwd.openDir(io, out_dir_path, .{}) };
    defer gen.out.close(io);

    try lower_tree(&gen, ui_dir, "src", "ui/src");
    try lower_tree(&gen, ui_dir, "gallery", "ui/gallery");
    try lower_file(&gen, icons_dir, "src/index.ts", "icons/src/index.js");
    // The runtime adapter re-exports the runtime's source tree; in the site the
    // runtime is the built one, reached by the import map.
    try write_out(&gen, "ui/src/publr-runtime.js", "export * from \"publr\";\n");
    if (gen.failures != 0) {
        std.debug.print("gallery_gen: {d} of {d} modules did not lower\n", .{ gen.failures, gen.lowered + gen.failures });
        return 1;
    }

    try copy_tree(&gen, runtime_dir, "runtime", ".js");
    try copy_file(&gen, jit_wasm, "runtime/jit_engine.wasm");
    try copy_file(&gen, preflight_css, "preflight.css");
    try copy_file(&gen, try std.fs.path.join(arena, &.{ ui_dir, "gallery/app/styles/gallery.css" }), "gallery.css");
    try write_recipes(&gen);
    try write_components(&gen);
    try gen.out.writeFile(io, .{ .sub_path = "index.html", .data = try page_html(&gen, index_body, true) });
    try gen.out.writeFile(io, .{ .sub_path = "preview.html", .data = try page_html(&gen, preview_body, false) });

    return 0;
}

/// Lowers every source file under `<root>/<sub>` into `<out>/<prefix>/...`.
fn lower_tree(gen: *Gen, root: []const u8, sub: []const u8, prefix: []const u8) !void {
    const base = try std.fs.path.join(gen.arena, &.{ root, sub });
    var dir = try std.Io.Dir.cwd().openDir(gen.io, base, .{ .iterate = true });
    defer dir.close(gen.io);
    var walker = try dir.walk(gen.arena);
    defer walker.deinit();

    while (try walker.next(gen.io)) |entry| {
        if (entry.kind != .file) continue;
        const name = entry.basename;
        const source_kind: enum { ptsx, ts, skip } = if (std.mem.endsWith(u8, name, ".ptsx"))
            .ptsx
        else if (std.mem.endsWith(u8, name, ".d.ts"))
            .skip
        else if (std.mem.endsWith(u8, name, ".ts"))
            .ts
        else
            .skip;
        if (source_kind == .skip) continue;

        const stem = name[0 .. name.len - (if (source_kind == .ptsx) @as(usize, 5) else 3)];
        const rel_dir = std.fs.path.dirname(entry.path) orelse "";
        const out_path = try std.fmt.allocPrint(gen.arena, "{s}/{s}{s}{s}.js", .{
            prefix, rel_dir, if (rel_dir.len > 0) "/" else "", stem,
        });
        try lower_file(gen, base, try gen.arena.dupe(u8, entry.path), out_path);

        if (std.mem.endsWith(u8, name, ".gallery.ptsx")) {
            try gen.recipes.append(gen.arena, out_path);
        } else if (source_kind == .ptsx and std.mem.startsWith(u8, prefix, "ui/src")) {
            try gen.components.append(gen.arena, out_path);
        }
    }
}

fn lower_file(gen: *Gen, root: []const u8, sub_path: []const u8, out_path: []const u8) !void {
    const filename = try std.fs.path.join(gen.arena, &.{ root, sub_path });
    const source = try std.Io.Dir.cwd().readFileAlloc(gen.io, filename, gen.arena, .limited(file_bytes_max));
    var resolver = pjsx.FileResolver{ .io = gen.io };
    const output = pjsx.dom.transformPjsxToDom(gen.arena, source, .{
        .filename = filename,
        .runtime_import = runtime_import,
        .resolver = resolver.resolver(),
    }) catch {
        std.debug.print("{s}: {s}\n", .{ filename, pjsx.lastError() });
        gen.failures += 1;
        return;
    };
    const code = try browser_specifiers(gen.arena, output.code);
    try write_out(gen, out_path, code);
    try gen.modules.append(gen.arena, out_path);
    if (std.mem.startsWith(u8, out_path, "ui/src/components/")) try collect_exports(gen, out_path, code);
    gen.lowered += 1;
}

/// Every `export function Name(` in a component module: the names a node
/// tree may use, which need not match the file (Dropdown.ptsx exports
/// DropdownMenu).
fn collect_exports(gen: *Gen, out_path: []const u8, code: []const u8) !void {
    var rest = code;
    while (std.mem.indexOf(u8, rest, "export function ")) |at| {
        const start = at + "export function ".len;
        var end = start;
        while (end < rest.len and (std.ascii.isAlphanumeric(rest[end]) or rest[end] == '_' or rest[end] == '$')) end += 1;
        if (end > start and std.ascii.isUpper(rest[start])) {
            try gen.exports.append(gen.arena, .{ .name = try gen.arena.dupe(u8, rest[start..end]), .path = out_path });
        }
        rest = rest[end..];
    }
}

/// The compiler rewrites `.ptsx` imports to `.js` but passes TypeScript-style
/// specifiers through: `./icons`, `../publr-runtime`, `./index.ts`, and a
/// re-exported `.ptsx`. A browser resolves none of those, so every relative
/// specifier in the output ends in `.js` exactly once.
fn browser_specifiers(arena: std.mem.Allocator, code: []const u8) ![]const u8 {
    var out: std.Io.Writer.Allocating = .init(arena);
    const w = &out.writer;
    var rest = code;
    while (std.mem.indexOf(u8, rest, "\"")) |open| {
        const close = std.mem.indexOfScalarPos(u8, rest, open + 1, '"') orelse break;
        const specifier = rest[open + 1 .. close];
        const before = std.mem.trimEnd(u8, rest[0..open], " \t\n");
        const is_import = std.mem.endsWith(u8, before, "from") or std.mem.endsWith(u8, before, "import") or std.mem.endsWith(u8, before, "import(");
        try w.writeAll(rest[0 .. open + 1]);
        if (is_import and specifier.len > 0 and specifier[0] == '.') {
            var stem = specifier;
            for ([_][]const u8{ ".ptsx", ".tsx", ".ts", ".js" }) |extension| {
                if (std.mem.endsWith(u8, stem, extension)) {
                    stem = stem[0 .. stem.len - extension.len];
                    break;
                }
            }
            try w.print("{s}.js", .{stem});
        } else {
            try w.writeAll(specifier);
        }
        try w.writeAll("\"");
        rest = rest[close + 1 ..];
    }
    try w.writeAll(rest);
    return out.written();
}

fn write_out(gen: *Gen, out_path: []const u8, data: []const u8) !void {
    if (std.fs.path.dirname(out_path)) |dir| try gen.out.createDirPath(gen.io, dir);
    try gen.out.writeFile(gen.io, .{ .sub_path = out_path, .data = data });
}

fn copy_file(gen: *Gen, from: []const u8, out_path: []const u8) !void {
    const data = try std.Io.Dir.cwd().readFileAlloc(gen.io, from, gen.arena, .limited(64 << 20));
    try write_out(gen, out_path, data);
}

fn copy_tree(gen: *Gen, from: []const u8, out_prefix: []const u8, extension: []const u8) !void {
    var dir = try std.Io.Dir.cwd().openDir(gen.io, from, .{ .iterate = true });
    defer dir.close(gen.io);
    var walker = try dir.walk(gen.arena);
    defer walker.deinit();
    while (try walker.next(gen.io)) |entry| {
        if (entry.kind != .file or !std.mem.endsWith(u8, entry.basename, extension)) continue;
        const source = try std.fs.path.join(gen.arena, &.{ from, entry.path });
        const out_path = try std.fs.path.join(gen.arena, &.{ out_prefix, entry.path });
        try copy_file(gen, source, try gen.arena.dupe(u8, out_path));
    }
}

/// `ui/gallery/app/generated/recipes.js`: one import per recipe, exported as a list in
/// label order so the sidebar and overview read stably.
fn write_recipes(gen: *Gen) !void {
    std.mem.sort([]const u8, gen.recipes.items, {}, string_less_than);
    var out: std.Io.Writer.Allocating = .init(gen.arena);
    const w = &out.writer;
    try w.writeAll("// Generated by gallery_gen: every recipe under gallery/components.\n");
    for (gen.recipes.items, 0..) |path, index| {
        std.debug.assert(std.mem.startsWith(u8, path, "ui/gallery/"));
        try w.print("import * as r{d} from \"../../{s}\";\n", .{ index, path["ui/gallery/".len..] });
    }
    // Each entry carries the recipe's file stem, which is the key the frames
    // load it by.
    try w.writeAll("export const recipes = [");
    for (gen.recipes.items, 0..) |path, index| {
        const base = std.fs.path.basename(path);
        const stem = base[0 .. base.len - ".gallery.js".len];
        try w.print("{s}{{ stem: \"{s}\", module: r{d} }}", .{ if (index == 0) "" else ", ", stem, index });
    }
    try w.writeAll("].sort((a, b) => a.module.meta.label.localeCompare(b.module.meta.label));\n");
    try write_out(gen, "ui/gallery/app/generated/recipes.js", out.written());

    // The frames load one recipe each, so a frame fetches only what its demo
    // imports. Keyed by the recipe's file stem, which is its component name.
    var lazy: std.Io.Writer.Allocating = .init(gen.arena);
    const lw = &lazy.writer;
    try lw.writeAll("// Generated by gallery_gen: one lazy import per recipe, by component name.\nexport const loaders = {\n");
    for (gen.recipes.items) |path| {
        const base = std.fs.path.basename(path);
        const stem = base[0 .. base.len - ".gallery.js".len];
        try lw.print("  \"{s}\": () => import(\"../../{s}\"),\n", .{ stem, path["ui/gallery/".len..] });
    }
    try lw.writeAll("};\n");
    try write_out(gen, "ui/gallery/app/generated/loaders.js", lazy.written());
}

/// `ui/gallery/app/generated/components.js`: a lazy loader per exported
/// component, so a node tree loads only the modules it names.
fn write_components(gen: *Gen) !void {
    var out: std.Io.Writer.Allocating = .init(gen.arena);
    const w = &out.writer;
    try w.writeAll("// Generated by gallery_gen: one lazy import per exported component.\nexport const loaders = {\n");
    for (gen.exports.items) |item| {
        std.debug.assert(std.mem.startsWith(u8, item.path, "ui/"));
        try w.print("  \"{s}\": () => import(\"../../../{s}\"),\n", .{ item.name, item.path["ui/".len..] });
    }
    try w.writeAll("};\n");
    try write_out(gen, "ui/gallery/app/generated/components.js", out.written());
}

fn string_less_than(_: void, a: []const u8, b: []const u8) bool {
    return std.mem.lessThan(u8, a, b);
}

/// A page: the shared head, preload hints so the module graph fetches in one
/// round of requests instead of a waterfall, and the page's body.
fn page_html(gen: *Gen, body: []const u8, whole_graph: bool) ![]const u8 {
    var out: std.Io.Writer.Allocating = .init(gen.arena);
    const w = &out.writer;
    try w.writeAll(head_html);
    for (runtime_files) |name| try w.print("<link rel=\"modulepreload\" href=\"./runtime/{s}.js\">\n", .{name});
    for (gen.modules.items) |path| {
        const app = std.mem.startsWith(u8, path, "ui/gallery/app/");
        const frame_module = app and (std.mem.indexOf(u8, path, "/runtime/") != null or std.mem.indexOf(u8, path, "/frames/") != null or std.mem.endsWith(u8, path, "/preview.js"));
        if (whole_graph or frame_module or std.mem.startsWith(u8, path, "icons/") or std.mem.endsWith(u8, path, "src/icons.js")) {
            try w.print("<link rel=\"modulepreload\" href=\"./{s}\">\n", .{path});
        }
    }
    try w.writeAll(body);
    return out.written();
}

const runtime_files = [_][]const u8{ "publr", "publr-dom", "publr-jsx", "publr-html", "publr-runtime", "publr-transport", "publr-query", "publr-focus", "publr-position", "publr-router", "publr-class-merge", "class-value", "lifecycle", "operation-context", "query-cache", "ref" };

const head_html =
    \\<!doctype html>
    \\<html lang="en">
    \\<head>
    \\<meta charset="utf-8">
    \\<meta name="viewport" content="width=device-width, initial-scale=1">
    \\<title>Publr UI</title>
    \\<link rel="stylesheet" href="./preflight.css">
    \\<link rel="stylesheet" href="./gallery.css">
    \\<script type="importmap">
    \\{"imports":{
    \\"publr-jsx":"./runtime/publr-jsx.js",
    \\"publr":"./runtime/publr.js",
    \\"publr/dom":"./runtime/publr-dom.js",
    \\"publr/html":"./runtime/publr-html.js",
    \\"publr/runtime":"./runtime/publr-runtime.js",
    \\"publr/transport":"./runtime/publr-transport.js",
    \\"publr/query":"./runtime/publr-query.js",
    \\"publr/focus":"./runtime/publr-focus.js",
    \\"publr/position":"./runtime/publr-position.js",
    \\"publr/router":"./runtime/publr-router.js",
    \\"publr/class-merge":"./runtime/publr-class-merge.js"
    \\}}
    \\</script>
    \\
;

const index_body =
    \\</head>
    \\<body>
    \\<div id="gallery"></div>
    \\<script type="module" src="./ui/gallery/app/main.js"></script>
    \\</body>
    \\</html>
    \\
;

const preview_body =
    \\</head>
    \\<body>
    \\<div id="preview"></div>
    \\<script type="module" src="./ui/gallery/app/preview.js"></script>
    \\</body>
    \\</html>
    \\
;
