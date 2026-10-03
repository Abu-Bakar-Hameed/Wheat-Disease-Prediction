"use client";

import { useState } from "react";
import { Shield, CheckCircle, Zap, Database, ArrowRight } from "lucide-react";

interface GuestLandingProps {
  onLogin: () => void;
}

export function GuestLanding({ onLogin }: GuestLandingProps) {
  const [authTab, setAuthTab] = useState<"login" | "register" | "forgot">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [resetNotice, setResetNotice] = useState("");

  const diseases = [
    {
      name: "Yellow Rust",
      scientific: "Puccinia striiformis",
      severity: "Critical High",
      severityColor: "bg-error-container text-on-error-container",
      image: "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400&h=300&fit=crop",
      description: "Forms bright yellow-orange pustules arranged in visible stripes parallel to leaf veins.",
    },
    {
      name: "Leaf Rust / Brown Rust",
      scientific: "Puccinia triticina",
      severity: "High Severity",
      severityColor: "bg-error-container text-on-error-container",
      image: "https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=400&h=300&fit=crop",
      description: "Scattered reddish-brown circular to oval pustules randomly distributed across the upper surface.",
    },
    {
      name: "Powdery Mildew",
      scientific: "Blumeria graminis",
      severity: "Moderate Risk",
      severityColor: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
      image: "https://images.unsplash.com/photo-1592921464583-bb1b8b93492c?w=400&h=300&fit=crop",
      description: "White-to-grey cottony fungal patches that turn dull brown as micro-structures develop.",
    },
    {
      name: "Healthy Flag Leaf",
      scientific: "Triticum aestivum",
      severity: "Optimal Health",
      severityColor: "bg-secondary-container text-on-secondary-container",
      image: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?w=400&h=300&fit=crop",
      description: "Uniform chloroplast density, zero necrotic lesioning, and optimal stomatal conductance.",
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin();
  };

  return (
    <main className="flex-1 overflow-y-auto">
      {/* Hero Banner */}
      <div className="relative bg-gradient-to-b from-surface-container-low via-background to-background py-16 px-gutter-desktop border-b border-outline-variant">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Hero Copy */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container border border-outline-variant text-label-md font-label-md text-primary">
              <Shield className="h-4 w-4 text-secondary" />
              <span>USDA Tested Diagnostic Benchmark (ResNet-50 + ViT)</span>
            </div>
            
            <h1 className="text-display-lg font-display-lg text-primary tracking-tight">
              Smart Wheat Disease Detection with Vision AI
            </h1>
            
            <p className="text-body-lg font-body-lg text-on-surface-variant max-w-2xl">
              Empowering agronomists, seed researchers, and field operators with instant, laboratory-grade fungal detection. Detect Yellow Rust, Septoria, and Powdery Mildew in sub-second inference.
            </p>

            {/* 3 Value Stats */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-outline-variant/60">
              <div>
                <div className="text-metric-display font-metric-display text-primary">96.8%</div>
                <div className="text-label-sm font-label-sm text-outline">Diagnostic Precision</div>
              </div>
              <div>
                <div className="text-metric-display font-metric-display text-secondary">142ms</div>
                <div className="text-label-sm font-label-sm text-outline">Inference Latency</div>
              </div>
              <div>
                <div className="text-metric-display font-metric-display text-primary">120k+</div>
                <div className="text-label-sm font-label-sm text-outline">Verified Leaves Analyzed</div>
              </div>
            </div>
          </div>

          {/* Right: Interactive Auth Modal */}
          <div className="lg:col-span-5">
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-lg p-6 sm:p-8">
              {/* Auth Form Switcher */}
              <div className="flex items-center gap-2 border-b border-outline-variant pb-4 mb-6">
                <button
                  onClick={() => setAuthTab("login")}
                  className={`flex-1 py-2 rounded-lg font-headline-sm text-headline-sm transition-all ${
                    authTab === "login"
                      ? "text-primary border-b-2 border-primary"
                      : "text-outline hover:text-primary"
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => setAuthTab("register")}
                  className={`flex-1 py-2 rounded-lg font-headline-sm text-headline-sm transition-all ${
                    authTab === "register"
                      ? "text-primary border-b-2 border-primary"
                      : "text-outline hover:text-primary"
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* Login Form */}
              {authTab === "login" && (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div>
                    <label className="block text-label-md font-label-md text-on-surface mb-1.5">
                      Agronomist / Farmer Email
                    </label>
                    <input
                      type="email"
                      required
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface focus:border-secondary focus:ring-1 focus:ring-secondary text-body-md font-body-md"
                      placeholder="name@farmcoop.com"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-label-md font-label-md text-on-surface">
                        Secret Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setAuthTab("forgot")}
                        className="text-label-sm font-label-sm text-secondary hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface focus:border-secondary focus:ring-1 focus:ring-secondary text-body-md font-body-md"
                        placeholder="Enter your password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-outline hover:text-primary"
                      >
                        {showPassword ? "👁️" : "👁️‍🗨️"}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="rounded text-primary focus:ring-secondary border-outline-variant"
                    />
                    <span className="text-label-md font-label-md text-on-surface-variant">
                      Remember device for 30 days
                    </span>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-lg bg-primary-container text-on-primary font-headline-sm text-headline-sm hover:bg-primary transition-all duration-150 shadow-xs flex items-center justify-center gap-2"
                  >
                    <span>Access Wheat Command</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-outline-variant" />
                    </div>
                    <div className="relative flex justify-center text-label-sm font-label-sm">
                      <span className="bg-surface-container-lowest px-2 text-outline">
                        Or federated login
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onLogin}
                    className="w-full py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container flex items-center justify-center gap-2 text-label-md font-label-md font-medium transition-colors"
                  >
                    <Database className="h-4 w-4" />
                    <span>Continue with Agricultural Cooperative SSO</span>
                  </button>
                </form>
              )}

              {/* Register Form */}
              {authTab === "register" && (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div>
                    <label className="block text-label-md font-label-md text-on-surface mb-1">
                      Full Legal Name
                    </label>
                    <input
                      type="text"
                      placeholder="Dr. Elena Rostov"
                      required
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface focus:border-secondary text-body-md font-body-md"
                    />
                  </div>

                  <div>
                    <label className="block text-label-md font-label-md text-on-surface mb-1">
                      Affiliation / Role
                    </label>
                    <select className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface focus:border-secondary text-body-md font-body-md">
                      <option>Commercial Grain Farmer</option>
                      <option>Field Agronomist / Consultant</option>
                      <option>Cereal Crop Pathologist</option>
                      <option>Agricultural Cooperative Manager</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-label-md font-label-md text-on-surface mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="elena@agricorp.org"
                      required
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface focus:border-secondary text-body-md font-body-md"
                    />
                  </div>

                  <div>
                    <label className="block text-label-md font-label-md text-on-surface mb-1">
                      Create Secure Password
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      required
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface focus:border-secondary text-body-md font-body-md"
                    />
                    <div className="flex gap-1 mt-1.5">
                      <div className="h-1 flex-1 rounded-full bg-secondary" />
                      <div className="h-1 flex-1 rounded-full bg-secondary" />
                      <div className="h-1 flex-1 rounded-full bg-secondary" />
                      <div className="h-1 flex-1 rounded-full bg-outline-variant" />
                    </div>
                    <span className="text-label-sm font-label-sm text-secondary">
                      Strong: 12+ chars with symbols
                    </span>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-lg bg-primary-container text-on-primary font-headline-sm text-headline-sm hover:bg-primary transition-all"
                  >
                    Create WheatGuard Workspace
                  </button>
                </form>
              )}

              {/* Forgot Password */}
              {authTab === "forgot" && (
                <div className="space-y-4">
                  <p className="text-body-md font-body-md text-on-surface-variant">
                    Enter your agronomy work email to receive a high-security cryptographic login link.
                  </p>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-on-surface focus:border-secondary text-body-md font-body-md"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setResetNotice("Password reset instructions were queued for your email.");
                      setAuthTab("login");
                    }}
                    className="w-full py-2 rounded-lg bg-primary text-on-primary font-headline-sm text-headline-sm"
                  >
                    Send Reset Link
                  </button>
                  {resetNotice && (
                    <p className="text-label-sm font-label-sm text-secondary">{resetNotice}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => setAuthTab("login")}
                    className="w-full py-1 text-label-md font-label-md text-secondary hover:underline"
                  >
                    Back to Sign In
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pathogen Knowledge Matrix Showcase */}
      <div className="max-w-7xl mx-auto py-16 px-gutter-desktop">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-headline-xl font-headline-xl text-primary">
            Classified Wheat Fungal Pathogens
          </h2>
          <p className="text-body-lg font-body-lg text-on-surface-variant mt-2">
            WheatGuard Neural Core recognizes subtle foliar lesions at early-stage manifestation before significant crop loss occurs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {diseases.map((disease, idx) => (
            <div
              key={idx}
              className="bg-surface-container-lowest rounded-xl border border-outline-variant p-5 hover:shadow-md transition-shadow"
            >
              <div className="w-full h-40 rounded-lg overflow-hidden mb-4 bg-surface-container relative">
                <img
                  src={disease.image}
                  alt={disease.name}
                  className="w-full h-full object-cover"
                />
                <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-label-sm font-label-sm font-semibold ${disease.severityColor}`}>
                  {disease.severity}
                </span>
              </div>
              <h3 className="text-headline-sm font-headline-sm text-on-surface">
                {disease.name}
              </h3>
              <p className="text-label-sm font-label-sm text-outline italic">
                {disease.scientific}
              </p>
              <p className="text-body-sm font-body-sm text-on-surface-variant mt-2">
                {disease.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
