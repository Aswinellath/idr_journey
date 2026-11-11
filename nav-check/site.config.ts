/**
 * Everything specific to the website lives here.
 * To check another site (e.g. vallath.in or samuhikpahal.org), copy this folder
 * and change the values below — the tests themselves don't need editing.
 */
export const site = {
  name: 'IDR Online',
  baseURL: process.env.BASE_URL || 'https://idronline.org',

  /** Pages whose menus are checked. Use stable pages that won't be deleted. */
  pages: ['/', '/about/'],

  /** Where menu links live: the header, nav bars and the mobile menu panel. */
  menuScope: 'header, nav, [class*="mobile-menu"], [class*="offcanvas"], [class*="off-canvas"]',

  /** The ☰ button that opens the menu on small screens (first visible one is used). */
  burgerSelectors: ['img[alt="Burger Menu"]', 'button[aria-label*="menu" i]'],

  /** Top-level items that must be visible in the desktop menu. */
  expectedDesktopItems: ['About', 'Sectors', 'Themes', 'Expertise', 'Humour', 'Features', 'Fellowship', 'More', 'IDR Answers', 'Donate'],

  /** Items that must be visible once the mobile menu is open. */
  expectedMobileItems: ['Sectors', 'Donate'],

  /**
   * Dropdowns that must exist and open. Others are found automatically.
   * Mobile: only items with an arrow/toggle or a "#" link count as dropdowns there.
   */
  expectedDesktopDropdowns: ['More', 'Languages'],
  expectedMobileDropdowns: ['More', 'Languages'],

  /** The desktop menu must have at least this many dropdowns. */
  minDesktopDropdowns: 1,

  /** Max number of top-level menu links clicked per browser/screen (keeps runs short). */
  maxClickLinks: 12,

  /** How many items inside each dropdown are clicked (the first N). All of them are still status-checked. */
  maxItemsPerDropdown: 4,

  /** Like a person: if a click/tap/hover does nothing, try again — this many times in total. */
  clickTries: 3,

  /**
   * Floating panels to close before testing menus (they can sit on top of the mobile menu).
   * Matched against button names, e.g. the IDR Answers chat panel's "Close chat" button.
   */
  closeButtons: [/^close chat$/i],

  /**
   * Third-party extras blocked during the test to keep pages fast (they don't affect menus).
   * Remove an entry if a menu ever depends on it.
   */
  blockHosts: [
    'youtube.com', 'youtube-nocookie.com', 'ytimg.com', 'googletagmanager.com', 'google-analytics.com',
    'doubleclick.net', 'facebook.net', 'facebook.com', 'connect.facebook.net', 'hotjar.com', 'clarity.ms',
  ],

  /** Links that are never checked. */
  skipLinks: [/^#/, /^javascript:/i, /^mailto:/i, /^tel:/i, /linkedin\.com/i],
};
