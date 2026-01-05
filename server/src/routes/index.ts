"use strict";

import contentApi from "./content-api";
import admin from "./admin";
import oauth from "./oauth";

export default {
  "content-api": {
    type: "content-api",
    routes: [...oauth, ...contentApi],
  },
  admin: {
    type: "admin",
    routes: [...admin],
  },
};