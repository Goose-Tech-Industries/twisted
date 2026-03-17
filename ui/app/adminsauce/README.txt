Replace these files in your UI app:

1. ui/components/admin/legacy-admin-host.tsx
2. ui/components/admin/admin-sidebar.tsx
3. ui/app/adminsauce/page.tsx

Then remove any import/use of VanillaPanel from ui/app/adminsauce/page.tsx (the replacement file already does this).

Recommended after replacing:
- delete ui/.next
- restart npm run dev

This patch keeps the new React shell/sidebar but runs the real legacy AdminSauce managers directly in the page without an iframe.
