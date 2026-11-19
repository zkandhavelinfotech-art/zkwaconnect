// Retired: fixed RTA/Smeram/demo passwords are not safe in a multi-tenant SaaS.
// Provision customers from SaaS Admin > Tenants and use set-primary-super-admin.ts
// only when rotating the internal product-owner credential.
console.error("This legacy credential seeder is retired. Use SaaS Admin provisioning for clients.")
process.exitCode = 1
