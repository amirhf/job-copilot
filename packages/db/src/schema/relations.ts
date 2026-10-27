import { relations } from 'drizzle-orm';
import {
  candidateProfile,
  careerSources,
  careerExperiences,
  careerBullets,
  careerProjects,
  careerStories,
  careerSkills,
  careerSkillEvidence,
} from './profile';
import { jobPostings, fitEvaluations } from './jobs';
import { applicationPackages, generationStreamEvents } from './applications';
import { preferenceMemory } from './memory';

export const candidateProfileRelations = relations(candidateProfile, ({ many }) => ({
  sources: many(careerSources),
  experiences: many(careerExperiences),
  bullets: many(careerBullets),
  projects: many(careerProjects),
  stories: many(careerStories),
  skills: many(careerSkills),
  preferenceMemories: many(preferenceMemory),
}));

export const careerSourcesRelations = relations(careerSources, ({ one, many }) => ({
  profile: one(candidateProfile, {
    fields: [careerSources.profileId],
    references: [candidateProfile.id],
  }),
  experiences: many(careerExperiences),
  bullets: many(careerBullets),
  projects: many(careerProjects),
  stories: many(careerStories),
}));

export const careerExperiencesRelations = relations(careerExperiences, ({ one, many }) => ({
  profile: one(candidateProfile, {
    fields: [careerExperiences.profileId],
    references: [candidateProfile.id],
  }),
  source: one(careerSources, {
    fields: [careerExperiences.sourceId],
    references: [careerSources.id],
  }),
  bullets: many(careerBullets),
  projects: many(careerProjects),
  stories: many(careerStories),
  skillEvidence: many(careerSkillEvidence),
}));

export const careerBulletsRelations = relations(careerBullets, ({ one, many }) => ({
  profile: one(candidateProfile, {
    fields: [careerBullets.profileId],
    references: [candidateProfile.id],
  }),
  experience: one(careerExperiences, {
    fields: [careerBullets.experienceId],
    references: [careerExperiences.id],
  }),
  source: one(careerSources, {
    fields: [careerBullets.sourceId],
    references: [careerSources.id],
  }),
  skillEvidence: many(careerSkillEvidence),
}));

export const careerProjectsRelations = relations(careerProjects, ({ one, many }) => ({
  profile: one(candidateProfile, {
    fields: [careerProjects.profileId],
    references: [candidateProfile.id],
  }),
  source: one(careerSources, {
    fields: [careerProjects.sourceId],
    references: [careerSources.id],
  }),
  linkedExperience: one(careerExperiences, {
    fields: [careerProjects.linkedExperienceId],
    references: [careerExperiences.id],
  }),
  stories: many(careerStories),
  skillEvidence: many(careerSkillEvidence),
}));

export const careerStoriesRelations = relations(careerStories, ({ one, many }) => ({
  profile: one(candidateProfile, {
    fields: [careerStories.profileId],
    references: [candidateProfile.id],
  }),
  source: one(careerSources, {
    fields: [careerStories.sourceId],
    references: [careerSources.id],
  }),
  linkedExperience: one(careerExperiences, {
    fields: [careerStories.linkedExperienceId],
    references: [careerExperiences.id],
  }),
  linkedProject: one(careerProjects, {
    fields: [careerStories.linkedProjectId],
    references: [careerProjects.id],
  }),
  skillEvidence: many(careerSkillEvidence),
}));

export const careerSkillsRelations = relations(careerSkills, ({ one, many }) => ({
  profile: one(candidateProfile, {
    fields: [careerSkills.profileId],
    references: [candidateProfile.id],
  }),
  evidenceLinks: many(careerSkillEvidence),
}));

export const careerSkillEvidenceRelations = relations(careerSkillEvidence, ({ one }) => ({
  skill: one(careerSkills, {
    fields: [careerSkillEvidence.skillId],
    references: [careerSkills.id],
  }),
  experience: one(careerExperiences, {
    fields: [careerSkillEvidence.experienceId],
    references: [careerExperiences.id],
  }),
  bullet: one(careerBullets, {
    fields: [careerSkillEvidence.bulletId],
    references: [careerBullets.id],
  }),
  project: one(careerProjects, {
    fields: [careerSkillEvidence.projectId],
    references: [careerProjects.id],
  }),
  story: one(careerStories, {
    fields: [careerSkillEvidence.storyId],
    references: [careerStories.id],
  }),
}));

export const jobPostingsRelations = relations(jobPostings, ({ one, many }) => ({
  fitEvaluation: one(fitEvaluations, {
    fields: [jobPostings.id],
    references: [fitEvaluations.jobPostingId],
  }),
  applicationPackages: many(applicationPackages),
  preferenceMemories: many(preferenceMemory),
}));

export const fitEvaluationsRelations = relations(fitEvaluations, ({ one }) => ({
  jobPosting: one(jobPostings, {
    fields: [fitEvaluations.jobPostingId],
    references: [jobPostings.id],
  }),
}));

export const applicationPackagesRelations = relations(applicationPackages, ({ one, many }) => ({
  jobPosting: one(jobPostings, {
    fields: [applicationPackages.jobPostingId],
    references: [jobPostings.id],
  }),
  streamEvents: many(generationStreamEvents),
}));

export const generationStreamEventsRelations = relations(generationStreamEvents, ({ one }) => ({
  applicationPackage: one(applicationPackages, {
    fields: [generationStreamEvents.packageId],
    references: [applicationPackages.id],
  }),
}));

export const preferenceMemoryRelations = relations(preferenceMemory, ({ one }) => ({
  profile: one(candidateProfile, {
    fields: [preferenceMemory.profileId],
    references: [candidateProfile.id],
  }),
  sourceJobPosting: one(jobPostings, {
    fields: [preferenceMemory.sourceJobPostingId],
    references: [jobPostings.id],
  }),
}));
