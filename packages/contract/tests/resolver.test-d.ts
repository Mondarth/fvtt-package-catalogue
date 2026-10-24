/**
 * The contract's data is what @mondarth/fvtt-resolver reads, so the resolver can take the API's
 * answers as they are. If the resolver's types change, these fail, and the contract must follow
 * (with a new major version if the change breaks clients).
 */
import { describe, expectTypeOf, it } from 'vitest';

import type * as resolver from '@mondarth/fvtt-resolver';
import type * as sources from '@mondarth/fvtt-resolver/sources';
import type * as contract from '../src/index.js';

describe("the contract's data", () => {
  it('is what the resolver reads', () => {
    expectTypeOf<contract.PackageRef>().toExtend<resolver.PackageRef>();
    expectTypeOf<contract.Compatibility>().toExtend<resolver.Compatibility>();
    expectTypeOf<contract.Relationship>().toExtend<resolver.Relationship>();
    expectTypeOf<contract.Release>().toExtend<resolver.Release>();
    expectTypeOf<contract.CoreRelease>().toExtend<resolver.CoreRelease>();
    expectTypeOf<contract.Universe>().toExtend<resolver.Universe>();
    expectTypeOf<contract.SourceGap>().toExtend<sources.SourceGap>();
  });

  it('holds everything the resolver gives', () => {
    expectTypeOf<keyof resolver.Release>().toEqualTypeOf<keyof contract.Release>();
    expectTypeOf<resolver.PackageType>().toEqualTypeOf<contract.PackageType>();
    expectTypeOf<resolver.CoreChannel>().toEqualTypeOf<contract.CoreChannel>();
  });
});
