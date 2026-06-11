export const INDENT_BASE_REM = 0.75;
export const INDENT_STEP_REM = 1.5;

export const indentStyle = (depth: number, extra = 0): { paddingLeft: string } => ({
  paddingLeft: `${INDENT_BASE_REM + depth * INDENT_STEP_REM + extra}rem`,
});
