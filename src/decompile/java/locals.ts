import type { Expr, BinOp } from '../../ast/ast.js';
import { expressionType } from '../../ast/types.js';
import type { JType } from '../../classfile/types.js';
import { adaptPrimitiveValue, adaptLambdaTarget } from '../calls.js';
import { declaredNameOf, lookupDeclared, declareSlot } from './scope.js';
import { declarationType, compatibleTypes, declarationValue, type LocalContext } from './types.js';

type Assignment = Extract<Expr, { kind: 'assign-expr' }>;
type Target = Extract<Assignment['target'], { kind: 'local' }>;

export type LocalAssignmentPlan =
  | { kind: 'declare'; name: string; jtype?: JType; value: Expr }
  | { kind: 'assign'; name: string; op?: BinOp; value: Expr };

export function prepareLocalAssignment(
  e: Assignment,
  target: Target,
  scope: LocalContext,
): LocalAssignmentPlan {
  const { slot, name, jtype } = target;
  if (e.op) {
    const rhs = e.expr;
    const value =
      rhs.kind === 'binary' &&
      rhs.op === e.op &&
      rhs.left.kind === 'local' &&
      rhs.left.slot === slot
        ? rhs.right
        : rhs;
    return { kind: 'assign', name: lookupDeclared(scope, slot), op: e.op, value };
  }
  const declared = declaredNameOf(scope, slot);
  const redeclare =
    declared === undefined ||
    (declared !== name &&
      name !== `var${slot}` &&
      declared !== `var${slot}` &&
      !declared.startsWith(name));
  const previous = scope.declTypes?.get(slot);
  let type = declarationType(scope, slot, e.expr, jtype);
  if (!jtype && e.expr.kind === 'array-load' && e.expr.array.kind === 'local') {
    const arrayType = scope.declTypes?.get(e.expr.array.slot);
    if (arrayType?.kind === 'array') type = arrayType.elem;
  }
  if (!redeclare && previous?.kind === 'prim' && type?.kind === 'prim') type = previous;
  const value =
    type?.kind === 'prim'
      ? adaptPrimitiveValue(
          e.expr,
          type,
          expressionType(e.expr, (slot) => scope.declTypes?.get(slot)),
        )
      : e.expr;
  const reuse =
    type &&
    previous &&
    !compatibleTypes(previous, type) &&
    (type.kind === 'array' ||
      type.kind === 'class' ||
      previous.kind === 'array' ||
      previous.kind === 'class');
  if (reuse && type) {
    const history = scope.declHistory?.get(slot) ?? [];
    let suffix = 2;
    while (history.includes(`${name}${suffix}`)) suffix++;
    const next = `${name}${suffix}`;
    declareSlot(scope, slot, next, type);
    return { kind: 'declare', name: next, jtype: type, value: declarationValue(value, type) };
  }
  if (redeclare) {
    declareSlot(scope, slot, name, type);
    return {
      kind: 'declare',
      name,
      jtype: type,
      value: type ? declarationValue(value, type) : value,
    };
  }
  const known = previous ?? scope.slotTypes.get(slot);
  if (
    known?.kind === 'prim' &&
    known.name === 'boolean' &&
    value.kind === 'const' &&
    value.ctype === 'int' &&
    (value.value === 0 || value.value === 1)
  ) {
    return {
      kind: 'assign',
      name: lookupDeclared(scope, slot),
      value: { kind: 'const', ctype: 'boolean', value: value.value === 1 },
    };
  }
  return {
    kind: 'assign',
    name: lookupDeclared(scope, slot),
    value: adaptLambdaTarget(value, previous ?? type),
  };
}
