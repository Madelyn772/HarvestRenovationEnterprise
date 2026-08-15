import { cacheDom } from './modules/dom.js';
import { adoptBootstrapState, bindAuthUi, initSupabase, restoreSession } from './modules/auth.js';

init();

async function init() {
  cacheDom();
  bindAuthUi();
  adoptBootstrapState();
  initSupabase();
  await restoreSession();
}
