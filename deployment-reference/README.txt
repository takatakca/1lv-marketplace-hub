The two files in this folder are preserved copies of the files uploaded by the user.

IMPORTANT:
- The uploaded vite.config.ts contained the useful Windows build workaround. That workaround is preserved in the root vite.config.ts, while Nitro is switched to the node-server preset so 1lv's TanStack server functions can run on MochaHost.
- The uploaded server.cjs belongs to a different Deli Aden project and imports server-customers.cjs, server-payments.cjs and server-realtime.cjs. Those files do not exist in the 1lv project, so that original file cannot be the 1lv production startup file.
- The root server.cjs is the corrected 1lv.ca MochaHost startup wrapper.
