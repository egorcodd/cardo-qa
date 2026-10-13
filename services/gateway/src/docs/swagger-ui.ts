import type { SwaggerUiOptions } from "swagger-ui-express";

export const swaggerUiOptions: SwaggerUiOptions = {
  customSiteTitle: "Cardo API",
  swaggerUrl: "/api/openapi.json",
  customfavIcon: "/logo.png",
  swaggerOptions: {
    deepLinking: true,
    docExpansion: "none",
    defaultModelsExpandDepth: 0,
    defaultModelExpandDepth: 1,
    filter: true,
    operationsSorter: "method",
    displayRequestDuration: true,
    persistAuthorization: false,
    validatorUrl: null,
  },
  customCss: `
    body { margin: 0; background: #fff; }
    .swagger-ui, .swagger-ui .info .title, .swagger-ui .opblock-tag,
    .swagger-ui .opblock-summary-description, .swagger-ui .btn {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .swagger-ui .topbar { display: none; }
    .swagger-ui .wrapper { max-width: 1180px; padding: 0 24px; }
    .swagger-ui .info { margin: 32px 0 20px; }
    .swagger-ui .info .title { font-size: 28px; font-weight: 650; }
    .swagger-ui .scheme-container {
      margin: 0 0 20px; padding: 16px 0; box-shadow: none;
      border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;
    }
    .swagger-ui .filter .operation-filter-input { border-color: #d1d5db; border-radius: 6px; }
    .swagger-ui .opblock-tag { font-size: 18px; font-weight: 600; padding: 14px 8px; }
    .swagger-ui .opblock { border-radius: 6px; box-shadow: none; margin-bottom: 10px; }
    .swagger-ui .opblock .opblock-summary { padding: 8px; }
    .swagger-ui .opblock .opblock-summary-description { font-size: 13px; }
    .swagger-ui .btn { border-radius: 6px; box-shadow: none; }
    .swagger-ui section.models { border-color: #e5e7eb; border-radius: 6px; }
    @media (max-width: 640px) {
      .swagger-ui .wrapper { padding: 0 12px; }
      .swagger-ui .info { margin-top: 20px; }
    }
  `,
};
