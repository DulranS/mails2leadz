/**
 * Advanced Lead Scoring Engine
 * Calculates engagement-based scores for conversion probability
 * Direct impact on sales team productivity and win rates
 */

export class LeadScoringEngine {
  constructor() {
    this.weights = {
      engagement: 0.30,
      activity: 0.25,
      stage: 0.20,
      firmographics: 0.15,
      behavior: 0.10,
    };

    this.thresholds = {
      hot: 80,
      warm: 60,
      cool: 40,
      cold: 0,
    };
  }

  calculateLeadScore(lead, historicalData = {}) {
    if (!lead) return 0;

    const engagementScore = this.calculateEngagementScore(lead);
    const activityScore = this.calculateActivityScore(lead);
    const stageScore = this.calculateStageScore(lead);
    const firmographicScore = this.calculateFirmographicScore(lead);
    const behaviorScore = this.calculateBehaviorScore(lead);

    const totalScore =
      engagementScore * this.weights.engagement +
      activityScore * this.weights.activity +
      stageScore * this.weights.stage +
      firmographicScore * this.weights.firmographics +
      behaviorScore * this.weights.behavior;

    return Math.min(100, Math.max(0, totalScore));
  }

  calculateEngagementScore(lead) {
    if (!lead) return 0;
    let score = 0;
    if (lead.replied) score += 50;
    if (lead.seemsInterested) score += 20;
    const followUpCount = Number(lead.followUpCount ?? 0);
    score += Math.min(30, followUpCount * 5);
    if (lead.emailOpens && lead.emailOpens > 0) score += Math.min(20, lead.emailOpens * 3);
    if (lead.emailClicks && lead.emailClicks > 0) score += Math.min(15, lead.emailClicks * 3);
    if (lead.whatsappReplied || lead.chatEngaged) score += 25;
    return Math.min(100, score);
  }

  calculateActivityScore(lead) {
    if (!lead) return 0;
    const now = new Date();
    let score = 0;
    if (lead.lastFollowUpAt) {
      const lastFollowUp = new Date(lead.lastFollowUpAt);
      const daysSinceFollowUp = (now - lastFollowUp) / (1000 * 60 * 60 * 24);
      if (daysSinceFollowUp <= 7) score += 40;
      else if (daysSinceFollowUp <= 14) score += 25;
      else score += 10;
    }
    if (lead.lastReplyAt) {
      const lastReply = new Date(lead.lastReplyAt);
      const daysSinceReply = (now - lastReply) / (1000 * 60 * 60 * 24);
      if (daysSinceReply <= 3) score += 35;
      else if (daysSinceReply <= 7) score += 20;
      else if (daysSinceReply <= 30) score += 10;
    }
    if (lead.sentAt) {
      const sentDate = new Date(lead.sentAt);
      const daysSinceSent = (now - sentDate) / (1000 * 60 * 60 * 24);
      if (daysSinceSent <= 1) score += 25;
      else if (daysSinceSent <= 7) score += 15;
      else if (daysSinceSent <= 30) score += 5;
    }
    return Math.min(100, score);
  }

  calculateStageScore(lead) {
    if (!lead) return 0;
    const stageScores = {
      closed_won: 100,
      closed_lost: 0,
      negotiation: 80,
      proposal: 70,
      qualified: 60,
      contacted: 40,
      prospecting: 20,
      new: 10,
    };
    return stageScores[lead.stage?.toLowerCase()] || 10;
  }

  calculateFirmographicScore(lead) {
    if (!lead) return 0;
    let score = 0;
    if (lead.companySize) {
      const size = lead.companySize.toLowerCase();
      if (size.includes("500") || size.includes("mid") || size.includes("growth")) score += 35;
      else if (size.includes("enterprise") || size.includes("1000")) score += 25;
      else if (size.includes("startup") || size.includes("small")) score += 15;
    }
    if (lead.industry) {
      const industry = lead.industry.toLowerCase();
      if (industry.includes("software") || industry.includes("tech") || industry.includes("saas") || industry.includes("marketing") || industry.includes("sales") || industry.includes("agency")) {
        score += 40;
      } else if (industry.includes("finance") || industry.includes("professional") || industry.includes("consulting") || industry.includes("education")) {
        score += 25;
      } else {
        score += 10;
      }
    }
    if (lead.timezone) score += 10;
    if (lead.estimatedBudget && lead.estimatedBudget > 10000) score += 15;
    else if (lead.estimatedBudget && lead.estimatedBudget > 5000) score += 10;
    return Math.min(100, score);
  }

  calculateBehaviorScore(lead) {
    if (!lead) return 0;
    let score = 0;
    if (lead.demoRequested) score += 50;
    if (lead.websiteVisits && lead.websiteVisits > 0) score += Math.min(30, lead.websiteVisits * 5);
    if (lead.viewedPricingPage) score += 30;
    if (lead.downloadedResource) score += 20;
    if (lead.urgencyIndicator || lead.hasTimeline) score += 25;
    if (lead.decisionMakersCount && lead.decisionMakersCount > 1) score += 15;
    if (lead.isPreviousCustomer) score += 40;
    return Math.min(100, score);
  }

  getLeadCategory(score) {
    if (score >= this.thresholds.hot) return "hot";
    if (score >= this.thresholds.warm) return "warm";
    if (score >= this.thresholds.cool) return "cool";
    return "cold";
  }

  getRecommendedAction(lead, score) {
    const category = this.getLeadCategory(score);
    const actions = {
      hot: { priority: "IMMEDIATE", action: "Call or WhatsApp immediately", nextStep: "Schedule demo/meeting", cadence: "Daily follow-up", confidence: "High conversion likelihood" },
      warm: { priority: "HIGH", action: "Personalized email or call", nextStep: "Qualify and schedule touchpoint", cadence: "2-3x per week", confidence: "Good conversion potential" },
      cool: { priority: "MEDIUM", action: "Nurture sequence or valuable content", nextStep: "Educational outreach", cadence: "Weekly", confidence: "Monitor for warming signals" },
      cold: { priority: "LOW", action: "Add to general nurture list", nextStep: "Quarterly check-in", cadence: "Monthly", confidence: "Re-qualify if engagement increases" },
    };
    return actions[category] || actions.cold;
  }

  scoreLeads(leads, historicalData = {}) {
    return leads.map((lead) => ({
      ...lead,
      leadScore: this.calculateLeadScore(lead, historicalData),
      category: this.getLeadCategory(this.calculateLeadScore(lead, historicalData)),
      recommendedAction: this.getRecommendedAction(lead, this.calculateLeadScore(lead, historicalData)),
    }));
  }

  getScoreBreakdown(lead, historicalData = {}) {
    return {
      engagement: { score: this.calculateEngagementScore(lead), weight: this.weights.engagement, contribution: this.calculateEngagementScore(lead) * this.weights.engagement },
      activity: { score: this.calculateActivityScore(lead), weight: this.weights.activity, contribution: this.calculateActivityScore(lead) * this.weights.activity },
      stage: { score: this.calculateStageScore(lead), weight: this.weights.stage, contribution: this.calculateStageScore(lead) * this.weights.stage },
      firmographics: { score: this.calculateFirmographicScore(lead), weight: this.weights.firmographics, contribution: this.calculateFirmographicScore(lead) * this.weights.firmographics },
      behavior: { score: this.calculateBehaviorScore(lead), weight: this.weights.behavior, contribution: this.calculateBehaviorScore(lead) * this.weights.behavior },
      totalScore: this.calculateLeadScore(lead, historicalData),
      category: this.getLeadCategory(this.calculateLeadScore(lead, historicalData)),
    };
  }
}

export const leadScoringEngine = new LeadScoringEngine();
