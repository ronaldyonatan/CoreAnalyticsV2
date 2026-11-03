import sheet0 from './components/styles/utilization.css?raw';
import sheet1 from './components/styles/daily-revenue.css?raw';
import sheet2 from './components/styles/dashboard-designer.css?raw';
import sheet3 from './components/styles/demography-fullscreen.css?raw';
import sheet4 from './components/styles/demography-card.css?raw';
import sheet5 from './components/styles/iol-usage.css?raw';
import sheet6 from './components/styles/doctor-fee.css?raw';
import sheet7 from './components/styles/material-summary.css?raw';
import sheet8 from './components/styles/revenue-summary.css?raw';
import sheet9 from './components/styles/channel-revenue.css?raw';
import sheet10 from './components/styles/surgery.css?raw';
import sheet11 from './components/styles/weekly-revenue.css?raw';
import sheet12 from './components/styles/login-gateway.css?raw';
import sheet13 from './components/styles/historical-shell.css?raw';

const sheets = {
  'utilization': sheet0,
  'daily-revenue': sheet1,
  'dashboard-designer': sheet2,
  'demography-fullscreen': sheet3,
  'demography-card': sheet4,
  'iol-usage': sheet5,
  'doctor-fee': sheet6,
  'material-summary': sheet7,
  'revenue-summary': sheet8,
  'channel-revenue': sheet9,
  'surgery': sheet10,
  'weekly-revenue': sheet11,
  'login-gateway': sheet12,
  'historical-shell': sheet13,
} as const;

export type ComponentStyleName = keyof typeof sheets;

/** Own component-scoped CSS centrally while retaining its original mount order.
 * Repeated chart instances keep their established stylesheet lifecycle. */
export function ComponentStyles({name}: {name: ComponentStyleName}) {
  return <style data-design-system={name}>{sheets[name]}</style>;
}
