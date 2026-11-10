/**
 * 配送費用（Shipping）模組
 *
 * 純函式、無 DB 依賴，集中處理配送方式、滿額免運、偏遠地區與當日急件等運費規則。
 *
 * 規則：
 * - 宅配（home_delivery）基本運費 120 元；商品小計滿 1,500 元免基本運費
 * - 超商取貨（convenience_store）60 元；不是基本運費，滿額也不免
 * - 偏遠地區加收 200 元（依收件地址關鍵字判定，不受滿額免運影響）
 * - 當日急件加收 250 元（不受滿額免運影響）
 */

const SHIPPING_METHODS = Object.freeze({
  HOME_DELIVERY: 'home_delivery',
  CONVENIENCE_STORE: 'convenience_store',
});

const HOME_DELIVERY_FEE = 120;
const CONVENIENCE_STORE_FEE = 60;
const FREE_SHIPPING_THRESHOLD = 1500;
const REMOTE_AREA_SURCHARGE = 200;
const URGENT_SURCHARGE = 250;

// 偏遠地區關鍵字（比對前會先將「台」正規化為「臺」）
const REMOTE_AREA_KEYWORDS = Object.freeze([
  '澎湖', '金門', '連江', '馬祖', '綠島', '蘭嶼', '琉球鄉', '小琉球',
]);

const VALID_METHODS = Object.values(SHIPPING_METHODS);

function isValidShippingMethod(method) {
  return VALID_METHODS.includes(method);
}

/**
 * 依地址關鍵字判斷是否為偏遠地區
 * @param {string} address
 * @returns {boolean}
 */
function isRemoteArea(address) {
  if (typeof address !== 'string' || address.trim() === '') return false;
  const normalized = address.replace(/台/g, '臺');
  return REMOTE_AREA_KEYWORDS.some(keyword => normalized.includes(keyword));
}

/**
 * 計算運費
 * @param {object} params
 * @param {number} params.subtotal       商品小計（非負整數）
 * @param {string} [params.shippingMethod='home_delivery']
 * @param {string} [params.address='']   收件地址，用於判定偏遠地區
 * @param {boolean} [params.isUrgent=false] 是否當日急件
 * @returns {{
 *   shippingMethod: string, baseFee: number, isFreeShipping: boolean,
 *   isRemoteArea: boolean, remoteSurcharge: number,
 *   isUrgent: boolean, urgentSurcharge: number, shippingFee: number
 * }}
 */
function calculateShipping({
  subtotal,
  shippingMethod = SHIPPING_METHODS.HOME_DELIVERY,
  address = '',
  isUrgent = false,
} = {}) {
  if (!Number.isInteger(subtotal) || subtotal < 0) {
    throw new TypeError('subtotal 必須為非負整數');
  }
  if (!isValidShippingMethod(shippingMethod)) {
    throw new TypeError(`不支援的配送方式：${shippingMethod}`);
  }

  // 基本運費：只有宅配適用滿額免運；超商取貨固定 60 元
  let baseFee;
  let isFreeShipping = false;
  if (shippingMethod === SHIPPING_METHODS.HOME_DELIVERY) {
    isFreeShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
    baseFee = isFreeShipping ? 0 : HOME_DELIVERY_FEE;
  } else {
    baseFee = CONVENIENCE_STORE_FEE;
  }

  // 附加費：不受滿額免運影響
  const remote = isRemoteArea(address);
  const urgent = isUrgent === true;
  const remoteSurcharge = remote ? REMOTE_AREA_SURCHARGE : 0;
  const urgentSurcharge = urgent ? URGENT_SURCHARGE : 0;

  return {
    shippingMethod,
    baseFee,
    isFreeShipping,
    isRemoteArea: remote,
    remoteSurcharge,
    isUrgent: urgent,
    urgentSurcharge,
    shippingFee: baseFee + remoteSurcharge + urgentSurcharge,
  };
}

module.exports = {
  SHIPPING_METHODS,
  HOME_DELIVERY_FEE,
  CONVENIENCE_STORE_FEE,
  FREE_SHIPPING_THRESHOLD,
  REMOTE_AREA_SURCHARGE,
  URGENT_SURCHARGE,
  REMOTE_AREA_KEYWORDS,
  isValidShippingMethod,
  isRemoteArea,
  calculateShipping,
};
