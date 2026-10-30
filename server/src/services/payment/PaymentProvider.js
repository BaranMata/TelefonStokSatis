/**
 * Ödeme sağlayıcı soyut arayüzü.
 * Gerçek bir sağlayıcı (ör. iyzico, PayTR, Stripe) entegre edilirken bu sınıftan türeyen bir
 * adaptör yazılır ve services/payment/index.js içindeki kayıt tablosuna eklenir. Uygulamanın geri
 * kalanı yalnızca bu arayüzü bilir.
 */
class PaymentProvider {
  get name() {
    throw new Error('name tanımlanmalı');
  }

  /**
   * Tek seferlik tahsilat.
   * @param {{amount:number, currency:string, description:string, paymentToken:string, metadata:object}} input
   *   paymentToken: kart bilgisi yerine sağlayıcının ödeme formundan dönen tek kullanımlık belirteç.
   *   Kart numarası bu sunucuya hiçbir zaman gelmez.
   * @returns {Promise<{status:'succeeded'|'failed', providerRef:string|null, failureReason?:string}>}
   */
  // eslint-disable-next-line no-unused-vars
  async charge(input) {
    throw new Error('charge() uygulanmalı');
  }

  /** İade (bu projede arayüz hazır, kullanılmıyor). */
  // eslint-disable-next-line no-unused-vars
  async refund(providerRef, amount) {
    throw new Error('refund() uygulanmalı');
  }
}

module.exports = PaymentProvider;
