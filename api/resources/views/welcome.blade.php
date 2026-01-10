<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="refresh" content="3;url=https://scholastic.cloud">

        <title>Scholastic Cloud</title>

        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: #fff;
                text-align: center;
                padding: 2rem;
            }

            .container {
                max-width: 600px;
                width: 100%;
            }

            .eye-icon {
                width: 200px;
                height: 200px;
                margin: 0 auto 2rem;
                animation: blink 3s infinite;
            }

            @keyframes blink {
                0%, 90%, 100% {
                    transform: scaleY(1);
                }
                45% {
                    transform: scaleY(0.1);
                }
            }

            h1 {
                font-size: 2rem;
                margin-bottom: 1rem;
                font-weight: 600;
            }

            p {
                font-size: 1.25rem;
                opacity: 0.9;
                margin-bottom: 2rem;
            }

            .redirect-link {
                color: #fff;
                text-decoration: underline;
                opacity: 0.8;
                transition: opacity 0.3s;
            }

            .redirect-link:hover {
                opacity: 1;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <svg class="eye-icon" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- Eye outline -->
                <ellipse cx="100" cy="100" rx="80" ry="50" stroke="currentColor" stroke-width="4" fill="rgba(255, 255, 255, 0.1)"/>
                
                <!-- Iris -->
                <circle cx="100" cy="100" r="35" fill="currentColor" opacity="0.3"/>
                
                <!-- Pupil -->
                <circle cx="100" cy="100" r="20" fill="currentColor"/>
                
                <!-- Highlight -->
                <circle cx="110" cy="90" r="8" fill="rgba(255, 255, 255, 0.8)"/>
                
                <!-- Eyelid top -->
                <path d="M 30 80 Q 100 60 170 80" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/>
                
                <!-- Eyelid bottom -->
                <path d="M 30 120 Q 100 140 170 120" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/>
            </svg>

            <h1>You are not welcome here</h1>
            <p>You'll be redirected shortly...</p>
            <p>
                <a href="https://scholastic.cloud" class="redirect-link">Click here if you are not redirected automatically</a>
            </p>
        </div>

        <script>
            // Fallback redirect after 3 seconds
            setTimeout(function() {
                window.location.href = 'https://scholastic.cloud';
            }, 3000);
        </script>
    </body>
</html>
