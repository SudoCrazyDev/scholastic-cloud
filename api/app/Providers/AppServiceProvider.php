<?php

namespace App\Providers;

use App\Models\ClassSection;
use App\Models\StudentSection;
use App\Models\StudentSubject;
use App\Models\Subject;
use App\Observers\ChatMembershipObserver;
use App\Services\Chat\ChatSyncQueue;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // One queue per request, so forty enrolment writes collapse into one
        // re-derivation of the section instead of forty.
        $this->app->singleton(ChatSyncQueue::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureRateLimiting();
        $this->configureChatMembershipSync();
    }

    /**
     * Wire the models that decide who belongs in a group chat to the observer
     * that re-derives it. Resolved lazily inside each closure so the per-request
     * queue is the one that collects the marks.
     */
    protected function configureChatMembershipSync(): void
    {
        $on = fn (string $method) => fn ($model) => $this->app
            ->make(ChatMembershipObserver::class)
            ->{$method}($model);

        ClassSection::saved($on('savedClassSection'));
        ClassSection::deleted($on('deletedClassSection'));

        Subject::saved($on('savedSubject'));
        Subject::deleted($on('deletedSubject'));

        StudentSection::saved($on('savedStudentSection'));
        StudentSection::deleted($on('deletedStudentSection'));

        StudentSubject::saved($on('savedStudentSubject'));
        StudentSubject::deleted($on('deletedStudentSubject'));
    }

    /**
     * Laravel does not rate limit anything unless asked, so until these were
     * defined the API — /login included — accepted unlimited attempts.
     */
    protected function configureRateLimiting(): void
    {
        // General API ceiling. Set high enough that ordinary use never reaches
        // it (grade sheets and payroll screens fire a lot of requests) while
        // still capping scripted abuse.
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(300)->by(
                $request->bearerToken() ?: $request->ip()
            );
        });

        // Credential endpoints get a much tighter budget, keyed on the email
        // being tried as well as the source address: keying on IP alone lets
        // one attacker lock out a shared school network, and keying on email
        // alone lets a botnet spread a spray across addresses.
        RateLimiter::for('login', function (Request $request) {
            $email = (string) $request->input('email');

            return [
                Limit::perMinute(5)->by('login:'.mb_strtolower($email).'|'.$request->ip()),
                Limit::perMinute(20)->by('login-ip:'.$request->ip()),
            ];
        });

        // Unauthenticated device and kiosk endpoints. A pairing code is short
        // enough to be worth guessing, so it must not be guessable at speed.
        RateLimiter::for('pairing', function (Request $request) {
            return Limit::perMinute(10)->by($request->ip());
        });

        // Posting to a group chat. Generous enough that nobody typing normally
        // will ever see it, tight enough that one account cannot flood a class
        // faster than a teacher can react.
        RateLimiter::for('chat-send', function (Request $request) {
            return Limit::perMinute(30)->by($request->bearerToken() ?: $request->ip());
        });
    }
}
