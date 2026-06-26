/**
 * Instant Paste — product / licensing configuration.
 *
 * This is the ONLY file you edit to wire up selling. After you create your
 * Gumroad product (with "Generate a license key per sale" enabled), paste the
 * product ID below and flip DEV_BYPASS to false.
 */

export const LICENSE_CONFIG = {
  /**
   * Your Gumroad product ID.
   * Find it in Gumroad: Product → Edit → "Share" / Advanced settings, or via
   * the product page URL. (Either GUMROAD_PRODUCT_ID or PERMALINK must be set.)
   */
  GUMROAD_PRODUCT_ID: '',

  /**
   * Alternative to the product ID — the permalink slug, i.e. the part after
   * gumroad.com/l/  (e.g. for gumroad.com/l/instantpaste → "instantpaste").
   */
  GUMROAD_PRODUCT_PERMALINK: '',

  /**
   * URL of your deployed license backend (the Cloudflare Worker in
   * ../license-backend). e.g. https://instant-paste-license.you.workers.dev
   * The plugin calls this to validate keys and bind them to one device.
   */
  LICENSE_API_URL: 'https://instant-paste-license.sanchitp.workers.dev',

  /** Public checkout URL customers visit to buy a license key. */
  BUY_URL: 'https://gumroad.com/',

  /** Shown on the activation screen. */
  PRICE_LABEL: '₹199 · Lifetime license',

  /** Support contact shown if activation fails. */
  SUPPORT_EMAIL: 'sanchitp498@gmail.com',

  /**
   * DEV ONLY. While true, the license gate is bypassed so you can keep
   * developing and testing freely.
   *
   * ⚠️  MUST be set to false (and a product ID filled in above) before you
   * ship/sell — otherwise anyone can use the plugin without paying.
   */
  DEV_BYPASS: false,

  /**
   * After a successful online validation, how many days the plugin keeps
   * working offline before it must reach Gumroad again.
   */
  OFFLINE_GRACE_DAYS: 30,
};
