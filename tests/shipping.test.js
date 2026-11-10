const {
  SHIPPING_METHODS,
  isRemoteArea,
  isValidShippingMethod,
  calculateShipping,
} = require('../src/utils/shipping');

const HOME = SHIPPING_METHODS.HOME_DELIVERY;
const STORE = SHIPPING_METHODS.CONVENIENCE_STORE;
const CITY = '臺北市大安區復興南路一段 100 號';
const REMOTE = '澎湖縣馬公市中正路 1 號';

describe('Shipping 模組', () => {
  describe('基本運費', () => {
    it('宅配基本運費為 120 元', () => {
      const r = calculateShipping({ subtotal: 1000, shippingMethod: HOME, address: CITY });
      expect(r.baseFee).toBe(120);
      expect(r.isFreeShipping).toBe(false);
      expect(r.shippingFee).toBe(120);
    });

    it('未指定配送方式時預設為宅配', () => {
      const r = calculateShipping({ subtotal: 1000, address: CITY });
      expect(r.shippingMethod).toBe(HOME);
      expect(r.shippingFee).toBe(120);
    });

    it('超商取貨費用為 60 元', () => {
      const r = calculateShipping({ subtotal: 1000, shippingMethod: STORE, address: CITY });
      expect(r.baseFee).toBe(60);
      expect(r.shippingFee).toBe(60);
    });

    it('超商取貨不是基本運費，小計滿 1,500 仍收 60 元', () => {
      const r = calculateShipping({ subtotal: 2000, shippingMethod: STORE, address: CITY });
      expect(r.isFreeShipping).toBe(false);
      expect(r.shippingFee).toBe(60);
    });
  });

  describe('滿額免運門檻', () => {
    it('商品小計 1,499 元：未達門檻，宅配收 120 元', () => {
      const r = calculateShipping({ subtotal: 1499, shippingMethod: HOME, address: CITY });
      expect(r.isFreeShipping).toBe(false);
      expect(r.shippingFee).toBe(120);
    });

    it('商品小計 1,500 元：免基本運費', () => {
      const r = calculateShipping({ subtotal: 1500, shippingMethod: HOME, address: CITY });
      expect(r.isFreeShipping).toBe(true);
      expect(r.baseFee).toBe(0);
      expect(r.shippingFee).toBe(0);
    });
  });

  describe('附加費', () => {
    it('偏遠地區加收 200 元', () => {
      const r = calculateShipping({ subtotal: 1000, shippingMethod: HOME, address: REMOTE });
      expect(r.isRemoteArea).toBe(true);
      expect(r.remoteSurcharge).toBe(200);
      expect(r.shippingFee).toBe(120 + 200);
    });

    it('超商取貨也適用偏遠地區附加費', () => {
      const r = calculateShipping({ subtotal: 1000, shippingMethod: STORE, address: '金門縣金城鎮' });
      expect(r.shippingFee).toBe(60 + 200);
    });

    it('當日急件加收 250 元', () => {
      const r = calculateShipping({ subtotal: 1000, shippingMethod: HOME, address: CITY, isUrgent: true });
      expect(r.isUrgent).toBe(true);
      expect(r.urgentSurcharge).toBe(250);
      expect(r.shippingFee).toBe(120 + 250);
    });

    it('多項附加費同時成立：宅配 + 偏遠 + 急件', () => {
      const r = calculateShipping({ subtotal: 1000, shippingMethod: HOME, address: REMOTE, isUrgent: true });
      expect(r.remoteSurcharge).toBe(200);
      expect(r.urgentSurcharge).toBe(250);
      expect(r.shippingFee).toBe(120 + 200 + 250);
    });

    it('多項附加費同時成立：超商 + 偏遠 + 急件', () => {
      const r = calculateShipping({ subtotal: 1000, shippingMethod: STORE, address: REMOTE, isUrgent: true });
      expect(r.shippingFee).toBe(60 + 200 + 250);
    });

    it('滿額免運與附加費同時成立：只免基本運費，附加費照收', () => {
      const r = calculateShipping({ subtotal: 1500, shippingMethod: HOME, address: REMOTE, isUrgent: true });
      expect(r.isFreeShipping).toBe(true);
      expect(r.baseFee).toBe(0);
      expect(r.shippingFee).toBe(200 + 250);
    });
  });

  describe('isRemoteArea', () => {
    it.each([
      '澎湖縣馬公市', '金門縣金湖鎮', '連江縣南竿鄉', '馬祖南竿',
      '臺東縣綠島鄉', '台東縣蘭嶼鄉', '屏東縣琉球鄉', '小琉球白沙港',
    ])('「%s」視為偏遠地區', (addr) => {
      expect(isRemoteArea(addr)).toBe(true);
    });

    it.each(['台北市信義區', '臺中市西屯區', '', null, undefined])('「%s」不是偏遠地區', (addr) => {
      expect(isRemoteArea(addr)).toBe(false);
    });
  });

  describe('參數驗證', () => {
    it('isValidShippingMethod 只接受 home_delivery / convenience_store', () => {
      expect(isValidShippingMethod(HOME)).toBe(true);
      expect(isValidShippingMethod(STORE)).toBe(true);
      expect(isValidShippingMethod('pickup')).toBe(false);
    });

    it('不支援的配送方式拋出錯誤', () => {
      expect(() => calculateShipping({ subtotal: 100, shippingMethod: 'drone' })).toThrow(TypeError);
    });

    it.each([-1, 1.5, '1000', undefined])('subtotal 為 %s 時拋出錯誤', (subtotal) => {
      expect(() => calculateShipping({ subtotal })).toThrow(TypeError);
    });

    it('isUrgent 只接受 true，其他真值不算急件', () => {
      const r = calculateShipping({ subtotal: 1000, address: CITY, isUrgent: 'yes' });
      expect(r.urgentSurcharge).toBe(0);
    });
  });
});
