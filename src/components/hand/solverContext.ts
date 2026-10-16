/**
 * The solver the hand view may offer, handed down from the app so the
 * replay's components need not be given it through each level. Absent, there is
 * no Solve button.
 */

import { createContext, useContext } from 'solid-js';

import type { SolveClient } from '#utils/app/solveClient';

export const SolverContext = createContext<SolveClient | undefined>(undefined);

export const useSolver = (): SolveClient | undefined => useContext(SolverContext);
