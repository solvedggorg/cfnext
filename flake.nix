{
  description = "awfixer.army development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        prismaEngines = pkgs.prisma-engines;
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            imagemagick
            nodejs_latest
            prisma
            prisma-engines
            openssl
          ];

          shellHook = ''
            export PRISMA_SCHEMA_ENGINE_BINARY="${prismaEngines}/bin/schema-engine"
            export PRISMA_QUERY_ENGINE_BINARY="${prismaEngines}/bin/query-engine"
            export PRISMA_FMT_BINARY="${prismaEngines}/bin/prisma-fmt"
            export OPENSSL_LIB_DIR="${pkgs.openssl.out}/lib"
            export OPENSSL_INCLUDE_DIR="${pkgs.openssl.dev}/include"
            export PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1

            # Prisma CLI reads these from the repo root .env via direnv.
            export AUTH_DATABASE_URL="''${AUTH_DATABASE_URL:-''${AUTH_PRISMA_DATABASE_URL:-}}"
          '';

          env = {
            PRISMA_SCHEMA_ENGINE_BINARY = "${prismaEngines}/bin/schema-engine";
            PRISMA_QUERY_ENGINE_BINARY = "${prismaEngines}/bin/query-engine";
            PRISMA_FMT_BINARY = "${prismaEngines}/bin/prisma-fmt";
          };
        };
      });
}
