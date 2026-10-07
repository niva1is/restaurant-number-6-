import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';

/** Спецификация OpenAPI 3 лежит в docs/openapi.yaml (одна и та же для src и dist). */
const SPEC_PATH = path.resolve(__dirname, '../../docs/openapi.yaml');

export const loadOpenApiSpec = (): Record<string, unknown> => YAML.parse(fs.readFileSync(SPEC_PATH, 'utf8'));

/** /api/docs — Swagger UI, /api/docs/openapi.json — спецификация в JSON. */
export const createDocsRouter = (): Router => {
  const spec = loadOpenApiSpec();
  const router = Router();
  router.get('/openapi.json', (_req, res) => {
    res.json(spec);
  });
  router.use(
    '/',
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: 'QR Restaurant API',
      swaggerOptions: { persistAuthorization: true, tryItOutEnabled: true, displayRequestDuration: true },
    }),
  );
  return router;
};
