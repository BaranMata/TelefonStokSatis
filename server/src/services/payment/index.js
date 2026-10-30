const config = require('../../config');
const MockPaymentProvider = require('./MockPaymentProvider');

// Sağlayıcı kayıt tablosu: yeni bir adaptör eklemek için buraya bir satır eklemek yeterlidir.
const registry = {
  mock: () => new MockPaymentProvider(),
};

let instance = null;

function getPaymentProvider() {
  if (!instance) {
    const factory = registry[config.paymentProvider];
    if (!factory) throw new Error(`Bilinmeyen ödeme sağlayıcısı: ${config.paymentProvider}`);
    instance = factory();
  }
  return instance;
}

module.exports = { getPaymentProvider };
