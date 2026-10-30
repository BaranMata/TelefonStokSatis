const crypto = require('node:crypto');
const PaymentProvider = require('./PaymentProvider');

/**
 * Geliştirme / demo amaçlı sahte sağlayıcı. Gerçek para hareketi yoktur.
 * paymentToken 'tok_fail' ise ödeme reddedilir, diğer durumlarda başarılı sayılır.
 */
class MockPaymentProvider extends PaymentProvider {
  get name() {
    return 'mock';
  }

  async charge({ amount, paymentToken }) {
    if (!(amount > 0)) return { status: 'failed', providerRef: null, failureReason: 'Geçersiz tutar' };
    if (paymentToken === 'tok_fail') return { status: 'failed', providerRef: null, failureReason: 'Test kartı reddedildi' };
    return { status: 'succeeded', providerRef: `mock_${crypto.randomBytes(6).toString('hex')}` };
  }

  async refund(providerRef) {
    return { status: 'succeeded', providerRef: `${providerRef}_refund` };
  }
}

module.exports = MockPaymentProvider;
