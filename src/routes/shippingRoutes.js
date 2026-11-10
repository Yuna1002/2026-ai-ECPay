const express = require('express');
const { SHIPPING_METHODS, isValidShippingMethod, calculateShipping } = require('../utils/shipping');

const router = express.Router();

/**
 * @openapi
 * /api/shipping/quote:
 *   post:
 *     summary: 運費試算（僅供前台預覽，實際金額以建立訂單時後端計算為準）
 *     tags: [Shipping]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [subtotal]
 *             properties:
 *               subtotal:
 *                 type: integer
 *                 minimum: 0
 *                 description: 商品小計
 *               shippingMethod:
 *                 type: string
 *                 enum: [home_delivery, convenience_store]
 *                 default: home_delivery
 *               recipientAddress:
 *                 type: string
 *                 description: 收件地址，用於判定偏遠地區
 *               isUrgent:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: 試算成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   allOf:
 *                     - $ref: '#/components/schemas/ShippingBreakdown'
 *                     - type: object
 *                       properties:
 *                         subtotal:
 *                           type: integer
 *                         totalAmount:
 *                           type: integer
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: 參數格式錯誤
 */
router.post('/quote', (req, res) => {
  const {
    subtotal,
    shippingMethod = SHIPPING_METHODS.HOME_DELIVERY,
    recipientAddress = '',
    isUrgent = false
  } = req.body;

  if (!Number.isInteger(subtotal) || subtotal < 0) {
    return res.status(400).json({ data: null, error: 'VALIDATION_ERROR', message: 'subtotal 必須為非負整數' });
  }
  if (!isValidShippingMethod(shippingMethod)) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: 'shippingMethod 必須為 home_delivery 或 convenience_store'
    });
  }
  if (typeof isUrgent !== 'boolean') {
    return res.status(400).json({ data: null, error: 'VALIDATION_ERROR', message: 'isUrgent 必須為布林值' });
  }
  if (typeof recipientAddress !== 'string') {
    return res.status(400).json({ data: null, error: 'VALIDATION_ERROR', message: 'recipientAddress 必須為字串' });
  }

  const shipping = calculateShipping({ subtotal, shippingMethod, address: recipientAddress, isUrgent });

  res.json({
    data: { ...shipping, subtotal, totalAmount: subtotal + shipping.shippingFee },
    error: null,
    message: '成功'
  });
});

module.exports = router;
