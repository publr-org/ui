const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    const pjsx = b.dependency("pjsx", .{ .target = target, .optimize = optimize });

    // The gate: every component parses, lowers to DOM, and lowers as one
    // program to Zig.
    const check = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("scripts/check.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{.{ .name = "pjsx", .module = pjsx.module("pjsx") }},
        }),
    });
    const run_check = b.addRunArtifact(check);
    run_check.setCwd(b.path("."));
    b.step("test", "Compile every component and demo with pjsx; lower the component set to Zig").dependOn(&run_check.step);

    // The gallery: a static site under zig-out/gallery, rendered in the
    // browser from the recipes with the runtime and the jit engine.
    const pjsx_host = b.dependency("pjsx", .{ .target = b.graph.host });
    const jit = b.dependency("publr_jit", .{ .target = target, .optimize = optimize });
    const engine = b.addExecutable(.{
        .name = "jit_engine",
        .root_module = b.createModule(.{
            .root_source_file = jit.path("src/wasm.zig"),
            .target = b.resolveTargetQuery(.{ .cpu_arch = .wasm32, .os_tag = .freestanding }),
            .optimize = .ReleaseSmall,
        }),
    });
    engine.entry = .disabled;
    engine.rdynamic = true;
    engine.export_memory = true;

    const tool = b.addExecutable(.{
        .name = "gallery_gen",
        .root_module = b.createModule(.{
            .root_source_file = b.path("scripts/gallery_gen.zig"),
            .target = b.graph.host,
            .optimize = .Debug,
            .imports = &.{.{ .name = "pjsx", .module = pjsx_host.module("pjsx") }},
        }),
    });
    const gen = b.addRunArtifact(tool);
    gen.addDirectoryArg(b.path("."));
    gen.addDirectoryArg(b.path("../icons"));
    gen.addDirectoryArg(b.path("../publr-js/dist"));
    gen.addArtifactArg(engine);
    gen.addFileArg(jit.path("src/preflight.css"));
    const site = gen.addOutputDirectoryArg("gallery");
    declare_inputs(b, gen, "src");
    declare_inputs(b, gen, "gallery");
    declare_inputs(b, gen, "../icons/src");
    declare_inputs(b, gen, "../publr-js/dist");

    const install = b.addInstallDirectory(.{ .source_dir = site, .install_dir = .prefix, .install_subdir = "gallery" });
    b.step("gallery", "Build the component gallery into zig-out/gallery").dependOn(&install.step);

    // Serve it with the workspace's own static file server.
    const http = b.dependency("http_server", .{ .target = target });
    const serve = b.addRunArtifact(http.artifact("publr-http"));
    serve.addArg("--root");
    serve.addDirectoryArg(site);
    serve.addArgs(&.{ "--response-bytes-max", "8388608", "--port", "8200" });
    if (b.args) |args| serve.addArgs(args);
    b.step("serve", "Serve the gallery at http://127.0.0.1:8200").dependOn(&serve.step);
}

/// A directory argument is hashed by path, so every file under it is declared
/// as an input and an edit anywhere re-runs the tool.
fn declare_inputs(b: *std.Build, run: *std.Build.Step.Run, dir: []const u8) void {
    const io = b.graph.io;
    const base = b.pathFromRoot(dir);
    var handle = std.Io.Dir.cwd().openDir(io, base, .{ .iterate = true }) catch {
        std.debug.panic("gallery inputs: cannot open {s}", .{base});
    };
    defer handle.close(io);
    var walker = handle.walk(b.allocator) catch @panic("out of memory");
    defer walker.deinit();
    while (walker.next(io) catch @panic("cannot walk the gallery inputs")) |entry| {
        if (entry.kind == .file) {
            run.addFileInput(.{ .cwd_relative = b.pathJoin(&.{ base, b.dupe(entry.path) }) });
        }
    }
}
