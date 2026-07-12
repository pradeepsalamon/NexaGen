const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function fixFile(filePath, regexes) {
  const fullPath = path.join(srcDir, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${fullPath}`);
    return;
  }
  let content = fs.readFileSync(fullPath, 'utf8');
  for (const regex of regexes) {
    content = content.replace(regex, '');
  }
  // also clean up any empty import lines like `import { } from "..."`
  content = content.replace(/^import\s*{\s*}\s*from\s*['"][^'"]+['"];?\r?\n/gm, '');
  // clean up extra commas in imports `import { A, , B }`
  content = content.replace(/,\s*,/g, ',');
  content = content.replace(/{\s*,/g, '{');
  content = content.replace(/,\s*}/g, '}');

  fs.writeFileSync(fullPath, content);
  console.log(`Fixed ${filePath}`);
}

// 1
fixFile('app/(auth)/verify-email/page.tsx', [
  /useAuthStore\s*,?/g
]);

// 2, 3
fixFile('app/admin/coaches/page.tsx', [
  /ChevronLeft\s*,?/g,
  /Link\s*,?/g,
  /import\s+Link\s+from\s+['"]next\/link['"];?\r?\n/g
]);
fixFile('app/classes/[id]/page.tsx', [
  /ChevronLeft\s*,?/g,
  /Link\s*,?/g,
  /import\s+Link\s+from\s+['"]next\/link['"];?\r?\n/g
]);

// 4
fixFile('components/ui/AlertDialog.tsx', [
  /\s*onPointerDownOutside={\(e\)\s*=>\s*e\.preventDefault\(\)}/g
]);

// 5
fixFile('components/ui/EmptyState.tsx', [
  /type\s+{?\s*ReactNode\s*}?\s*,?/g,
  /import\s+type\s+{\s*}\s*from\s+['"]react['"];?\r?\n/g
]);

// 6
fixFile('features/auth/components/AuthHeader.tsx', [
  /Logo\s*,?/g
]);

// 7
fixFile('features/auth/components/CoachRegisterForm.tsx', [
  /Card\s*,?/g
]);

// 8
fixFile('features/auth/components/ProfileForm.tsx', [
  /getErrorMessage\s*,?/g
]);

// 9
fixFile('features/batches/components/AddMemberDialog.tsx', [
  /Plus\s*,?/g
]);

// 10
fixFile('features/batches/components/BatchForm.tsx', [
  /UserPlus\s*,?/g,
  /BatchStatus\s*,?/g,
  /Select\s*,?/g,
  /import\s+{\s*Select\s*}\s*from\s+['"].*?['"];?\r?\n/g
]);

// 11
fixFile('features/batches/components/BatchManagementClient.tsx', [
  /VisibilityState\s*,?/g,
  /BatchStatus\s*,?/g,
  /Badge\s*,?/g,
  /AddMemberDialog\s*,?/g,
  /import\s+{\s*AddMemberDialog\s*}\s*from\s+['"].*?['"];?\r?\n/g,
  /useCreateBatchMutation\s*,?/g,
  /const\s+{\s*mutateAsync:\s*updateMutation\s*}.*?;/g
]);

// 12
fixFile('features/coach/components/CoachDashboardClient.tsx', [
  /toast\s*,?/g
]);

// 13
fixFile('features/trash/components/TrashManagementClient.tsx', [
  /pendingActions\s*,?/g,
  /setSorting\s*,?/g,
  /const\s+\[\s*sorting,\s*setSorting\s*\]\s*=\s*useState<.*?>\(\[\]\);/g
]);

// 14
fixFile('features/trash/hooks/useTrashApi.ts', [
  /TrashEntity\s*,?/g
]);

// 15
fixFile('features/users/components/UserForm.tsx', [
  /UserRole\s*,?/g,
  /UserStatus\s*,?/g
]);

// 16
fixFile('features/users/components/UserManagementClient.tsx', [
  /VisibilityState\s*,?/g
]);

// 17
fixFile('hooks/useDataTable.ts', [
  /Table\s*,?/g
]);

// 18
fixFile('providers/AppProviders.tsx', [
  /EmailVerificationBanner\s*,?/g,
  /import\s*{\s*EmailVerificationBanner\s*}\s*from\s+['"].*?['"];?\r?\n/g
]);

console.log("Done");
