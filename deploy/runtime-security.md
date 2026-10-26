# AWS web runtime image checks

The build and web runtime use the same pinned Node24 Alpine3.24 image. Both stages refresh Alpine security packages and install OpenSSL/CA certificates. Only the final runtime removes global npm/npx/yarn/corepack after production dependencies have been installed; the build stage keeps npm.

The existing `--omit=dev --ignore-scripts` production install, Node entry point, non-root user, upload directory, schema guard and database secret injection remain unchanged. This does not change the other Discord bot Dockerfiles or remove application dependencies such as undici, ffmpeg-static or opusscript.

CI checks the actual immutable image ID before image export. It verifies Alpine and absent runtime package-manager commands, loads the web entry's mariadb/discord.js dependencies without networking, and scans OS plus Node libraries. Both inventories must be positive. High/Critical findings, scanner errors or missing coverage block release; all severity counts remain visible. Config, ignore inputs, telemetry and raw scanner output are excluded. The existing fresh-schema/auth/persistence/memory tests still have to pass.

The Node24/musl build and actual application behavior must pass CI before this candidate is deployed. Module loading is not a Discord voice or external API test. No Discord, mail or model requests are introduced. Only the existing safe validation summaries are uploaded.

If application validation fails after a reviewed deployment, restore the prior immutable app image and its image environment value. Do not migrate or remove the database, upload mount or other services. The deployer's protected-source guard and management Tailscale stay unchanged.
