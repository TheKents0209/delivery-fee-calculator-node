import { writeFileSync } from 'node:fs';
import { openApiDocument } from '../src/openapi.ts';

writeFileSync('openapi.json', JSON.stringify(openApiDocument, null, 2) + '\n');
console.info('Wrote openapi.json');
