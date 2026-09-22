//! The design system's own gate: every component and every gallery demo parses
//! into the compiler's IR, lowers through the DOM target, and the whole
//! component set lowers through the Zig target as one program (what the CMS
//! generates its admin from). Run from the repository root by `zig build test`.
const std = @import("std");
const pjsx = @import("pjsx");

const components_dir = "src/components";
const file_bytes_max = 4 << 20;
const components_min = 100;

const Entry = struct { path: []const u8, source: []const u8, module: *const pjsx.compiler.ModuleIR };

const Corpus = struct {
    entries: []const Entry,
    modules: []const *const pjsx.compiler.ModuleIR,
    /// Files that did not parse, with the compiler's diagnostic.
    failures: u32,
};

fn read_corpus(arena: std.mem.Allocator, io: std.Io, dir_path: []const u8) !Corpus {
    var dir = try std.Io.Dir.cwd().openDir(io, dir_path, .{ .iterate = true });
    defer dir.close(io);

    var entries: std.ArrayList(Entry) = .empty;
    var modules: std.ArrayList(*const pjsx.compiler.ModuleIR) = .empty;
    var failures: u32 = 0;
    var walker = try dir.walk(arena);
    defer walker.deinit();

    while (try walker.next(io)) |entry| {
        if (entry.kind != .file or !std.mem.endsWith(u8, entry.basename, ".ptsx")) {
            continue;
        }

        const source = try dir.readFileAlloc(io, entry.path, arena, .limited(file_bytes_max));
        const label = try std.fs.path.join(arena, &.{ dir_path, entry.path });
        var resolver = pjsx.FileResolver{ .io = io };
        const module = pjsx.compiler.createPjsxModuleWithResolver(arena, source, label, resolver.resolver()) catch {
            std.debug.print("{s}/{s}: {s}\n", .{ dir_path, entry.path, pjsx.lastError() });
            failures += 1;

            continue;
        };
        try modules.append(arena, module);
        try entries.append(arena, .{ .path = try arena.dupe(u8, entry.path), .source = source, .module = module });
    }

    std.debug.assert(modules.items.len + failures > 0);

    return .{ .entries = entries.items, .modules = modules.items, .failures = failures };
}

fn lower_dom(arena: std.mem.Allocator, corpus: Corpus, label: []const u8) u32 {
    var failures: u32 = 0;

    var resolver = pjsx.FileResolver{ .io = std.testing.io };
    for (corpus.entries) |entry| {
        _ = pjsx.dom.transformPjsxToDom(arena, entry.source, .{ .filename = entry.module.filename, .runtime_import = "publr-jsx", .resolver = resolver.resolver() }) catch {
            std.debug.print("{s}: {s} does not lower to DOM: {s}\n", .{ label, entry.path, pjsx.lastError() });
            failures += 1;
        };
    }

    return failures;
}

test "every component parses and lowers to DOM and, as one program, to Zig" {
    var arena_state = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena_state.deinit();
    const arena = arena_state.allocator();
    const io = std.testing.io;

    const corpus = try read_corpus(arena, io, components_dir);
    try std.testing.expect(corpus.modules.len >= components_min);
    try std.testing.expectEqual(@as(u32, 0), corpus.failures);
    try std.testing.expectEqual(@as(u32, 0), lower_dom(arena, corpus, "components"));

    const program = try pjsx.targets.zig.Program.init(arena, corpus.modules);
    var failures: u32 = 0;

    for (corpus.modules) |module| {
        _ = program.lower(arena, module.component.name) catch {
            std.debug.print("components: {s} does not lower to Zig: {s}\n", .{ module.component.name, pjsx.lastError() });
            failures += 1;
        };
    }

    try std.testing.expectEqual(@as(u32, 0), failures);
}

// `gallery/**` holds no components: the recipe modules export `meta` and
// variants (see gallery/gallery-types.ts), and `gallery/app` is the gallery's
// shell, in PTSX with its logic in TypeScript. They only ever run in the
// browser, so they only have to lower to DOM.
test "every recipe and the gallery app lower to DOM" {
    var arena_state = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena_state.deinit();
    const arena = arena_state.allocator();
    const io = std.testing.io;

    var dir = try std.Io.Dir.cwd().openDir(io, "gallery", .{ .iterate = true });
    defer dir.close(io);
    var walker = try dir.walk(arena);
    defer walker.deinit();

    var checked: u32 = 0;
    var failures: u32 = 0;
    var resolver = pjsx.FileResolver{ .io = io };
    while (try walker.next(io)) |entry| {
        const name = entry.basename;
        const source_file = std.mem.endsWith(u8, name, ".ptsx") or (std.mem.endsWith(u8, name, ".ts") and !std.mem.endsWith(u8, name, ".d.ts"));
        if (entry.kind != .file or !source_file) continue;
        const path = try std.fs.path.join(arena, &.{ "gallery", entry.path });
        const source = try dir.readFileAlloc(io, entry.path, arena, .limited(file_bytes_max));
        _ = pjsx.dom.transformPjsxToDom(arena, source, .{ .filename = path, .runtime_import = "publr-jsx", .resolver = resolver.resolver() }) catch {
            std.debug.print("gallery: {s} does not lower to DOM: {s}\n", .{ path, pjsx.lastError() });
            failures += 1;
        };
        checked += 1;
    }

    try std.testing.expect(checked >= 40);
    try std.testing.expectEqual(@as(u32, 0), failures);
}
