export function getTargetRepo(): string {
  return process.env.VBC_TARGET_REPO || process.cwd();
}
