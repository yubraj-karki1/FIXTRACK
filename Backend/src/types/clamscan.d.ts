// `clamscan` ships no type declarations. Only the surface actually used by
// malware-scan.service.ts is typed there via a local interface; this ambient module
// declaration just satisfies the import itself.
declare module 'clamscan';
