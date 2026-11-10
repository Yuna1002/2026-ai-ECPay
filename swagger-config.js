const swaggerOptions = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'E-Commerce Demo API',
      version: '1.0.0',
      description: '花卉電商網站 REST API'
    },
    servers: [{ url: 'http://localhost:3001' }],
    components: {
      schemas: {
        ShippingBreakdown: {
          type: 'object',
          description: '運費明細（由 src/utils/shipping.js 計算）',
          properties: {
            shippingMethod: { type: 'string', enum: ['home_delivery', 'convenience_store'] },
            baseFee: { type: 'integer', description: '基本運費：宅配 120（小計滿 1,500 為 0）；超商取貨固定 60' },
            isFreeShipping: { type: 'boolean', description: '是否觸發滿額免基本運費（僅宅配）' },
            isRemoteArea: { type: 'boolean', description: '收件地址是否為偏遠地區' },
            remoteSurcharge: { type: 'integer', description: '偏遠地區附加費（200 或 0）' },
            isUrgent: { type: 'boolean', description: '是否當日急件' },
            urgentSurcharge: { type: 'integer', description: '當日急件附加費（250 或 0）' },
            shippingFee: { type: 'integer', description: '運費總額 = baseFee + remoteSurcharge + urgentSurcharge' }
          }
        }
      },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        sessionId: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Session-Id'
        }
      }
    }
  },
  apis: ['./src/routes/*.js']
};

module.exports = swaggerOptions;
