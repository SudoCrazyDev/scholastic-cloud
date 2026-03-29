# /test-record

Test a feature in the browser using MCP Playwright and produce a screen recording.

## Usage
```
/test-record <feature-description>
```

## What this skill does

You are an automated QA tester for the ScholasticCloud app running at `http://localhost:5173`.

When the user runs `/test-record <feature>`, follow these steps:

### 1. Plan the test
- Read the relevant source files for the feature (pages, hooks, services, controllers) to understand what to test
- Identify the happy path, edge cases, and any known issues

### 2. Run the browser test using MCP Playwright
- Use `mcp__playwright__browser_navigate` to open the app
- Log in using credentials: `philiplouis0717@gmail.com` / `password`
- Navigate to the feature and test it step-by-step:
  - Use `mcp__playwright__browser_snapshot` before each interaction to get element refs
  - Use `mcp__playwright__browser_click`, `mcp__playwright__browser_fill_form`, `mcp__playwright__browser_select_option` for interactions
  - Use `mcp__playwright__browser_wait_for` to wait for responses
  - Use `mcp__playwright__browser_console_messages` and `mcp__playwright__browser_network_requests` to catch errors
  - Use `mcp__playwright__browser_evaluate` to inspect API responses when needed
- Do NOT take screenshots during the MCP session

### 3. Produce a screen recording
After the MCP test pass, write and run a standalone Node.js Playwright script that:
- Uses `chromium.launch({ headless: false, slowMo: 500 })` for a visible, human-paced recording
- Sets `recordVideo: { dir: 'recordings/', size: { width: 1280, height: 720 } }` on the browser context
- Replays the exact same steps tested above
- Closes the context at the end to flush the video
- Prints the path of the saved `.webm` file

Save the script to `test-scripts/<feature-name>.js` and run it with `node`.

### 4. Report results
After the recording completes, report:
- ✅/❌ for each test step
- Any bugs found with details (error message, API response, component)
- The path to the saved recording file

## Notes
- The app runs on `http://localhost:5173` (frontend) and `http://localhost:8000/api` (backend)
- Auth token is stored in `localStorage` as `auth_token`
- Recordings are saved to `recordings/` (gitignored)
- Test scripts are saved to `test-scripts/`
- If the backend returns an error, investigate the relevant controller/model before reporting
