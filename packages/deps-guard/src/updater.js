/**
 * updater.js
 *
 * Executa o comando de atualização ou audit fix do package manager.
 */

import { execSync } from "node:child_process";

function buildCommand(pm, packages, auditFix) {
  if (auditFix) {
    switch (pm) {
      case "npm":
        return "npm audit fix";
      case "pnpm":
        return "pnpm audit --fix";
      case "yarn":
        return "yarn npm audit --fix"; // yarn berry; classic não tem --fix
      case "bun":
        return "bun audit --fix";
      default:
        throw new Error(`Package manager não suportado: ${pm}`);
    }
  }

  const pkgList = packages.join(" ");
  switch (pm) {
    case "npm":
      return packages.length ? `npm install ${pkgList} --save` : "npm update";
    case "pnpm":
      return packages.length
        ? `pnpm update --recursive --latest ${pkgList}`
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
 * @param {{
 *   packages:  string[],
 *   pm:        string,
 *   root:      string,
 *   auditFix?: boolean,
 * }} options
 * @returns {Promise<boolean>}
 */
export async function runUpdate({ packages, pm, root, auditFix = false }) {
  const cmd = buildCommand(pm, packages, auditFix);

  try {
    execSync(cmd, {
      cwd: root,
      stdio: "inherit",
      encoding: "utf8",
      shell: process.platform === "win32" ? "cmd.exe" : true,
    });
    return true;
  } catch (err) {
    if (err.stdout?.toString().length > 0) return true;
    return false;
  }
}
