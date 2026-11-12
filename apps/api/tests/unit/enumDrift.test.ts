import { describe, expect, it } from 'vitest';
import { ENUM_PAIRS } from '../../src/contract-checks.js';
import * as prismaEnums from '../../src/generated/prisma/enums.js';

describe('enum drift check (schema.prisma ↔ @routepulse/shared)', () => {
  it.each(ENUM_PAIRS)('%s: shared values equal Prisma values in the same order', (_name, sharedValues, prismaEnum) => {
    expect([...sharedValues]).toEqual(Object.values(prismaEnum));
  });

  it('covers every enum Prisma generates', () => {
    const prismaNames = Object.keys(prismaEnums).sort();
    const checked = ENUM_PAIRS.map(([name]) => name).sort();
    expect(checked).toEqual(prismaNames);
  });
});
