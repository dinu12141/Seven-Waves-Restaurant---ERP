import { ROLE_LANDING, ROLE_PRIORITY } from '../src/config/roles.ts';

console.log('--- Testing Role Landing Pages for All Roles & Multi-Roles ---');

function getDefaultLandingPage(roles) {
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role) && ROLE_LANDING[role]) {
      return ROLE_LANDING[role];
    }
  }
  return '/dashboard';
}

const testCases = [
  { label: 'Cashier single role', roles: ['cashier'] },
  { label: 'Cashier + Kitchen dual role', roles: ['kitchen', 'cashier'] },
  { label: 'Kitchen single role', roles: ['kitchen'] },
  { label: 'Waiter single role', roles: ['waiter'] },
  { label: 'Manager single role', roles: ['manager'] },
  { label: 'Admin single role', roles: ['admin'] },
];

for (const tc of testCases) {
  const landing = getDefaultLandingPage(tc.roles);
  console.log(`${tc.label.padEnd(30)} => Landing: ${landing}`);
}
