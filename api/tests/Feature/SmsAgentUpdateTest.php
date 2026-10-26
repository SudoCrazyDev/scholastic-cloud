<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\SmsGateway;
use App\Support\SmsAgentBundle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * `npm run update` on a kiosk: it asks which agent version the API serves, then
 * downloads the source over its own gateway token. What must hold is that only a
 * paired kiosk gets the source, and that the bundle never carries an env file —
 * writing one over the kiosk's would wipe its token and strand it unpaired.
 */
class SmsAgentUpdateTest extends TestCase
{
    use RefreshDatabase;

    private string $token;

    protected function setUp(): void
    {
        parent::setUp();

        $institution = Institution::factory()->create(['title' => 'Agent Update School']);
        $this->token = 'test-gateway-token-'.uniqid();

        SmsGateway::create([
            'institution_id' => $institution->id,
            'name' => 'Gate Kiosk',
            'status' => 'unknown',
            'sms_token_hash' => hash('sha256', $this->token),
        ]);
    }

    public function test_the_version_matches_the_bundled_agent(): void
    {
        $this->withHeader('Authorization', 'Bearer '.$this->token)
            ->getJson('/api/sms-gateway/agent/version')
            ->assertOk()
            ->assertJson(['version' => SmsAgentBundle::version()]);
    }

    public function test_the_bundle_carries_the_agent_source_but_no_env_file(): void
    {
        $files = collect(
            $this->withHeader('Authorization', 'Bearer '.$this->token)
                ->getJson('/api/sms-gateway/agent/bundle')
                ->assertOk()
                ->json('files')
        );

        $paths = $files->pluck('path');
        $this->assertContains('package.json', $paths);
        $this->assertContains('src/index.ts', $paths);
        $this->assertContains('scripts/update.mjs', $paths);
        $this->assertNotContains('.env', $paths);
        $this->assertNotContains('sms-gateway.env', $paths);

        $package = json_decode(base64_decode($files->firstWhere('path', 'package.json')['content']), true);
        $this->assertSame(SmsAgentBundle::version(), $package['version']);
    }

    public function test_an_unpaired_caller_gets_nothing(): void
    {
        $this->getJson('/api/sms-gateway/agent/version')->assertUnauthorized();
        $this->withHeader('Authorization', 'Bearer not-a-real-token')
            ->getJson('/api/sms-gateway/agent/bundle')
            ->assertUnauthorized();
    }
}
