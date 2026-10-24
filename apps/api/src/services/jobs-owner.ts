/** Background jobs for the owner area. */
import { jobs } from './jobs';
import { runSaasBilling } from './owner-saas';

jobs.push({ name: 'saas-billing', run: runSaasBilling });
