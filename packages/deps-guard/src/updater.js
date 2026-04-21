/**
 * Executa o comando de atualização do package manager detectado.
 * Retorna true em caso de sucesso, false caso contrário.
 */

import { execSync } from "node:child_process";

/**
 * Monta o comando de atualização para cada package manager.
 *
 * @param {"npm" | "pnpm" | "yarn" | "bun"} pm
 * @param {string[]} packages  Lista de pacotes a atualizar (vazio = todos)
 * @returns {string}
 */
function buildCommand(pm, packages) {
  const pkgList = packages.join(" ");

  switch (pm) {
    case "npm":
      return packages.length ? `npm install ${pkgList} --save` : "npm update";

    case "pnpm":
      return packages.length
        ? `pnpm update --latest ${pkgList}`
        : "pnpm update --recursive --latest";

    case "yarn":
      return packages.length
        ? `yarn upgrade ${pkgList} --latest`
        : "yarn upgrade --latest";

    case "bun":
      return packages.length ? `bun update ${pkgList}` : "bun update";

    default:
      throw new Error(`Package manager não suportado: ${pm}`);
  }
}

/**
 * Executa a atualização dos pacotes informados.
 *
 * @param {{
 *   packages: string[],
 *   pm:       "npm" | "pnpm" | "yarn" | "bun",
 *   root:     string,
 * }} options
 * @returns {Promise<boolean>}
 */
export async function runUpdate({ packages, pm, root }) {
  const cmd = buildCommand(pm, packages);

  try {
    execSync(cmd, {
      cwd: root,
      stdio: "inherit",
      encoding: "utf8",
      shell: process.platform === "win32" ? "cmd.exe" : true,
    });
    return true;
  } catch (err) {
    // Alguns package managers saem com status ≠ 0 mesmo em sucesso parcial.
    // Se houve saída em stdout, consideramos sucesso.
    if (err.stdout?.toString().length > 0) return true;
    return false;
  }
}
