export default {
  extends: [
    "stylelint-config-standard"
  ],
  plugins: ["stylelint-order"],
  rules: {
    "no-duplicate-selectors": true,
    "no-empty-source": true,
    "property-no-vendor-prefix": true,
    "value-no-vendor-prefix": true,
    "selector-no-vendor-prefix": true,
    "media-feature-name-no-vendor-prefix": true,
    "at-rule-no-vendor-prefix": true,
    "order/order": [
      "custom-properties",
      "declarations",
      {
        type: "at-rule",
        name: "media"
      },
      "rules"
    ],
    "order/properties-alphabetical-order": true,
    "property-no-unknown": [
      true,
      {
        ignoreProperties: ["backdrop-filter", "mask-image", "scrollbar-width"]
      }
    ],
    "selector-pseudo-element-no-unknown": [
      true,
      {
        ignorePseudoElements: ["-webkit-scrollbar", "v-deep"]
      }
    ]
  }
};
