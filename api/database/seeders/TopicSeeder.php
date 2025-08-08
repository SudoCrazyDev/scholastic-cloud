<?php

namespace Database\Seeders;

use App\Models\Topic;
use App\Models\Subject;
use Illuminate\Database\Seeder;

class TopicSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Get all subjects
        $subjects = Subject::all();

        if ($subjects->isEmpty()) {
            $this->command->info('No subjects found. Please run SubjectSeeder first.');
            return;
        }

        $sampleTopics = [
            'Mathematics' => [
                ['title' => 'Introduction to Algebra', 'description' => 'Basic concepts and terminology in algebra', 'order' => 1, 'is_completed' => true],
                ['title' => 'Linear Equations', 'description' => 'Solving equations with one variable', 'order' => 2, 'is_completed' => true],
                ['title' => 'Systems of Linear Equations', 'description' => 'Solving systems of equations with multiple variables', 'order' => 3, 'is_completed' => false],
                ['title' => 'Quadratic Equations', 'description' => 'Solving quadratic equations and factoring', 'order' => 4, 'is_completed' => false],
                ['title' => 'Polynomial Functions', 'description' => 'Understanding polynomial functions and their graphs', 'order' => 5, 'is_completed' => false],
            ],
            'Science' => [
                ['title' => 'Introduction to Chemistry', 'description' => 'Basic chemical concepts and atomic structure', 'order' => 1, 'is_completed' => true],
                ['title' => 'Chemical Bonding', 'description' => 'Understanding different types of chemical bonds', 'order' => 2, 'is_completed' => true],
                ['title' => 'Chemical Reactions', 'description' => 'Types of chemical reactions and balancing equations', 'order' => 3, 'is_completed' => false],
                ['title' => 'Acids and Bases', 'description' => 'Properties and reactions of acids and bases', 'order' => 4, 'is_completed' => false],
                ['title' => 'Organic Chemistry', 'description' => 'Introduction to organic compounds and reactions', 'order' => 5, 'is_completed' => false],
            ],
            'English' => [
                ['title' => 'Grammar Fundamentals', 'description' => 'Basic grammar rules and sentence structure', 'order' => 1, 'is_completed' => true],
                ['title' => 'Parts of Speech', 'description' => 'Understanding nouns, verbs, adjectives, and more', 'order' => 2, 'is_completed' => true],
                ['title' => 'Sentence Types', 'description' => 'Simple, compound, and complex sentences', 'order' => 3, 'is_completed' => false],
                ['title' => 'Essay Writing', 'description' => 'Structure and techniques for essay writing', 'order' => 4, 'is_completed' => false],
                ['title' => 'Literature Analysis', 'description' => 'Analyzing literary works and themes', 'order' => 5, 'is_completed' => false],
            ],
            'History' => [
                ['title' => 'Ancient Civilizations', 'description' => 'Study of early human civilizations', 'order' => 1, 'is_completed' => true],
                ['title' => 'Medieval Period', 'description' => 'European history during the Middle Ages', 'order' => 2, 'is_completed' => true],
                ['title' => 'Renaissance and Reformation', 'description' => 'Cultural and religious changes in Europe', 'order' => 3, 'is_completed' => false],
                ['title' => 'Age of Exploration', 'description' => 'European exploration and colonization', 'order' => 4, 'is_completed' => false],
                ['title' => 'Industrial Revolution', 'description' => 'Technological and social changes', 'order' => 5, 'is_completed' => false],
            ],
        ];

        foreach ($subjects as $subject) {
            $subjectTitle = $subject->title;
            
            // Find matching topics for this subject
            $topicsToCreate = $sampleTopics[$subjectTitle] ?? $sampleTopics['Mathematics'];
            
            foreach ($topicsToCreate as $topicData) {
                Topic::create([
                    'subject_id' => $subject->id,
                    'title' => $topicData['title'],
                    'description' => $topicData['description'],
                    'order' => $topicData['order'],
                    'is_completed' => $topicData['is_completed'],
                ]);
            }
        }

        $this->command->info('Topics seeded successfully!');
    }
}
