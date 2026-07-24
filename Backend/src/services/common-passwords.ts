// A small deny-list of frequently breached/guessed passwords. Checked in addition to the
// composition rules in password.service.ts so structurally "strong" but common passwords
// (e.g. Password123!) are still rejected.

const commonPasswords = new Set(
  [
    'password', 'password1', 'password123', 'password1234', 'passw0rd', 'passw0rd123',
    '12345678', '123456789', '1234567890', '123456', '1234567', '12345', 'qwerty', 'qwerty123',
    'qwertyuiop', 'letmein', 'letmein123', 'welcome', 'welcome123', 'welcome1', 'monkey',
    'dragon', 'dragon123', 'master', 'master123', 'admin', 'admin123', 'administrator',
    'iloveyou', 'sunshine', 'princess', 'football', 'football1', 'baseball', 'basketball',
    'trustno1', 'superman', 'batman', 'shadow', 'shadow123', 'michael', 'jennifer', 'jordan',
    'hunter', 'hunter2', 'freedom', 'whatever', 'starwars', 'access', 'flower', 'summer',
    'winter', 'spring', 'autumn', 'harley', 'ranger', 'buster', 'soccer', 'hockey', 'killer',
    'george', 'sexy', 'andrew', 'charlie', 'daniel', 'matthew', 'joshua', 'ginger', 'nicole',
    'chelsea', 'biteme', 'matrix', 'cheese', 'purple', 'orange', 'yellow', 'silver', 'golden',
    'diamond', 'phoenix', 'thunder', 'cookie', 'coffee', 'chocolate', 'butterfly', 'rainbow',
    'sunflower', 'blessed', 'forever', 'always', 'family', 'friends', 'happiness', 'success',
    'changeme', 'changeit', 'letme1n', 'passpass', 'newpassword', 'newpass123', 'temppass',
    'temppass123', 'temp1234', 'guest', 'guest123', 'root', 'toor', 'testtest', 'test1234',
    'test123456', 'demo1234', 'demopassword', 'default', 'defaultpass', 'passwordpassword',
    'abc123456', 'abcd1234', 'a1b2c3d4', 'qazwsx123', '1q2w3e4r', '1qaz2wsx', 'zaq12wsx',
    'asdfghjkl', 'asdf1234', 'poiuytrewq', 'mynoob', 'nobody123', 'iloveyou1', 'trustno1234',
    'p@ssw0rd', 'p@ssword', 'p@ssw0rd1', 'passw0rd!', 'password!', 'password@123',
    'welcome@123', 'admin@123', 'qwerty1234', 'qwerty12345', 'letmein1234', 'login123',
    'loginpass', 'football123', 'baseball123', 'basketball1', 'iloveyou123', 'sunshine123',
    'princess123', 'monkey123', 'dragon1234', 'master1234', 'shadow1234', 'superman123',
    'batman123', 'starwars123', 'trustno11', 'whatever123', 'freedom123', 'access1234',
    'flower123', 'summer123', 'winter123', 'spring123', 'autumn123', 'hockey123', 'soccer123',
    'chelsea123', 'jordan123', 'michael123', 'jennifer1', 'matthew123', 'joshua123',
    'daniel123', 'andrew123', 'charlie123', 'george123', 'harley123', 'ranger123',
    'buster123', 'ginger123', 'nicole123', 'thunder123', 'phoenix123', 'diamond123',
    'rainbow123', 'butterfly1', 'chocolate1', 'cookie123', 'coffee123', 'purple123',
    'orange123', 'yellow123', 'silver123', 'golden123'
  ].map((entry) => entry.toLowerCase())
);

export function isCommonPassword(password: string): boolean {
  const lower = password.toLowerCase();
  if (commonPasswords.has(lower)) return true;

  // Also check with punctuation stripped, so "Password123!" is caught by the "password123"
  // entry rather than requiring every punctuation variant to be listed separately.
  const alnumOnly = lower.replace(/[^a-z0-9]/g, '');
  return commonPasswords.has(alnumOnly);
}
