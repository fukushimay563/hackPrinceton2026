"use client";

import { useState, useRef, useEffect } from "react";
import {
  MapPin,
  Briefcase,
  ChevronDown,
  Check,
  SlidersHorizontal,
  Info,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  CreditCard,
} from "lucide-react";
import {
  calculateCrossBorderTax,
  searchHometowns,
  POPULAR_HOMETOWNS,
  COMMUTER_PRESETS,
  type CrossBorderTaxResult,
  type KnownCity,
} from "@/lib/finance/localTax";
import { InfoTip } from "@/components/ui";
import type { FilingStatus } from "@/lib/finance/tax2025";

interface HometownTaxSelectorProps {
  residenceHometown?: string;
  workHometown?: string;
  isDifferentWorkLocation?: boolean;
  crossBorder?: CrossBorderTaxResult;
  annualGross: number;
  filingStatus: FilingStatus;
  manualRatePct: number;
  isManualOverride?: boolean;
  onChange: (args: {
    residenceHometown: string;
    workHometown?: string;
    isDifferentWorkLocation: boolean;
    effectiveRatePct: number;
    isManual: boolean;
  }) => void;
}

export function HometownTaxSelector({
  residenceHometown = "Trenton, NJ",
  workHometown = "New York, NY",
  isDifferentWorkLocation = false,
  crossBorder,
  annualGross,
  filingStatus,
  manualRatePct,
  isManualOverride = false,
  onChange,
}: HometownTaxSelectorProps) {
  const [resQuery, setResQuery] = useState(residenceHometown);
  const [prevResidence, setPrevResidence] = useState(residenceHometown);
  const [isResOpen, setIsResOpen] = useState(false);

  const [workQuery, setWorkQuery] = useState(workHometown || "New York, NY");
  const [prevWork, setPrevWork] = useState(workHometown || "New York, NY");
  const [isWorkOpen, setIsWorkOpen] = useState(false);

  const [differentWork, setDifferentWork] = useState(isDifferentWorkLocation);
  const [showOverride, setShowOverride] = useState(isManualOverride);

  const resContainerRef = useRef<HTMLDivElement>(null);
  const workContainerRef = useRef<HTMLDivElement>(null);

  // Sync inputs when props change
  if (prevResidence !== residenceHometown) {
    setPrevResidence(residenceHometown);
    if (!isResOpen) setResQuery(residenceHometown);
  }
  if (prevWork !== (workHometown || "New York, NY")) {
    setPrevWork(workHometown || "New York, NY");
    if (!isWorkOpen) setWorkQuery(workHometown || "New York, NY");
  }

  // Compute dynamic cross-border tax
  const cb =
    crossBorder ??
    calculateCrossBorderTax({
      residenceHometown: resQuery,
      workHometown: differentWork ? workQuery : resQuery,
      annualGross,
      filingStatus,
    });

  const resSuggestions = searchHometowns(resQuery);
  const workSuggestions = searchHometowns(workQuery);

  // Handle outside clicks
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (resContainerRef.current && !resContainerRef.current.contains(e.target as Node)) {
        setIsResOpen(false);
      }
      if (workContainerRef.current && !workContainerRef.current.contains(e.target as Node)) {
        setIsWorkOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectResidenceCity = (cityObj: KnownCity) => {
    const formatted = `${cityObj.city}, ${cityObj.state}`;
    setResQuery(formatted);
    setIsResOpen(false);
    const newCb = calculateCrossBorderTax({
      residenceHometown: formatted,
      workHometown: differentWork ? workQuery : formatted,
      annualGross,
      filingStatus,
    });
    onChange({
      residenceHometown: formatted,
      workHometown: differentWork ? workQuery : formatted,
      isDifferentWorkLocation: differentWork,
      effectiveRatePct: newCb.totalRatePct,
      isManual: false,
    });
  };

  const handleSelectWorkCity = (cityObj: KnownCity) => {
    const formatted = `${cityObj.city}, ${cityObj.state}`;
    setWorkQuery(formatted);
    setIsWorkOpen(false);
    const newCb = calculateCrossBorderTax({
      residenceHometown: resQuery,
      workHometown: formatted,
      annualGross,
      filingStatus,
    });
    onChange({
      residenceHometown: resQuery,
      workHometown: formatted,
      isDifferentWorkLocation: true,
      effectiveRatePct: newCb.totalRatePct,
      isManual: false,
    });
  };

  const handleToggleDifferentWork = (checked: boolean) => {
    setDifferentWork(checked);
    const effectiveWork = checked ? workQuery : resQuery;
    const newCb = calculateCrossBorderTax({
      residenceHometown: resQuery,
      workHometown: effectiveWork,
      annualGross,
      filingStatus,
    });
    onChange({
      residenceHometown: resQuery,
      workHometown: effectiveWork,
      isDifferentWorkLocation: checked,
      effectiveRatePct: newCb.totalRatePct,
      isManual: false,
    });
  };

  const handleSelectCommuterPreset = (preset: (typeof COMMUTER_PRESETS)[0]) => {
    setResQuery(preset.residence);
    setWorkQuery(preset.work);
    setDifferentWork(true);
    setIsResOpen(false);
    setIsWorkOpen(false);
    const newCb = calculateCrossBorderTax({
      residenceHometown: preset.residence,
      workHometown: preset.work,
      annualGross,
      filingStatus,
    });
    onChange({
      residenceHometown: preset.residence,
      workHometown: preset.work,
      isDifferentWorkLocation: true,
      effectiveRatePct: newCb.totalRatePct,
      isManual: false,
    });
  };

  const isNycResident =
    cb.residence.state === "NY" &&
    (cb.residence.city.toLowerCase().includes("new york") ||
      cb.residence.city.toLowerCase().includes("brooklyn") ||
      cb.residence.city.toLowerCase().includes("queens") ||
      cb.residence.city.toLowerCase().includes("bronx") ||
      cb.residence.city.toLowerCase().includes("staten island"));

  return (
    <div className="space-y-4">
      {/* Primary Residence Input */}
      <div className="space-y-2" ref={resContainerRef}>
        <div className="flex items-center justify-between">
          <label htmlFor="residence-input" className="flex items-center text-sm font-medium text-ink-2">
            <span>Where you live (Residence)</span>
            <InfoTip>
              Your state and city of residence taxes your worldwide income, but gives credits for taxes paid to other states.
            </InfoTip>
          </label>
        </div>

        <div className="relative">
          <div className="relative flex items-center">
            <MapPin size={16} className="pointer-events-none absolute left-3 text-brand" />
            <input
              id="residence-input"
              type="text"
              value={resQuery}
              onChange={(e) => {
                setResQuery(e.target.value);
                setIsResOpen(true);
              }}
              onFocus={() => setIsResOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setIsResOpen(false);
                  const newCb = calculateCrossBorderTax({
                    residenceHometown: resQuery,
                    workHometown: differentWork ? workQuery : resQuery,
                    annualGross,
                    filingStatus,
                  });
                  onChange({
                    residenceHometown: resQuery,
                    workHometown: differentWork ? workQuery : resQuery,
                    isDifferentWorkLocation: differentWork,
                    effectiveRatePct: newCb.totalRatePct,
                    isManual: false,
                  });
                }
              }}
              placeholder="e.g. Trenton, NJ or Philadelphia, PA"
              className="w-full rounded-xl border border-line bg-white py-2.5 pr-8 pl-9 text-sm text-ink-1 placeholder:text-ink-3 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
              autoComplete="off"
            />
            <ChevronDown
              size={16}
              className={`pointer-events-none absolute right-3 text-ink-3 transition-transform ${
                isResOpen ? "rotate-180" : ""
              }`}
            />
          </div>

          {/* Residence Dropdown */}
          {isResOpen && (
            <div className="absolute z-30 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-line bg-white py-1 shadow-lg">
              <div className="px-3 py-1.5 text-2xs font-semibold text-ink-3 uppercase tracking-wider">
                {resQuery ? "Matching Cities" : "Popular Locations"}
              </div>
              {resSuggestions.map((c) => {
                const full = `${c.city}, ${c.state}`;
                const isSelected =
                  cb.residence.city.toLowerCase() === c.city.toLowerCase() && cb.residence.state === c.state;
                return (
                  <button
                    key={full}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectResidenceCity(c);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-paper ${
                      isSelected ? "bg-paper/70 font-medium text-brand" : "text-ink-1"
                    }`}
                  >
                    <span>{full}</span>
                    {isSelected && <Check size={14} className="text-brand" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cross-Border / Commuter Toggle */}
      <div className="rounded-xl border border-line/80 bg-paper/40 p-3">
        <label className="flex cursor-pointer items-start gap-2.5 select-none">
          <input
            type="checkbox"
            checked={differentWork}
            onChange={(e) => handleToggleDifferentWork(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded accent-brand"
          />
          <div className="text-xs">
            <span className="font-semibold text-ink-1">I work in a different city or state</span>
            <p className="text-ink-3">
              Commuting across state or city borders? We account for state reciprocity, out-of-state tax credits, and non-resident commuter rules.
            </p>
          </div>
        </label>

        {/* Workplace Input (Visible when differentWork is checked) */}
        {differentWork && (
          <div className="mt-3.5 pt-3 border-t border-line/60 space-y-2" ref={workContainerRef}>
            <label htmlFor="work-input" className="flex items-center text-xs font-semibold text-ink-2">
              <Briefcase size={13} className="mr-1.5 text-amber-600" />
              <span>Where you work (Income Source)</span>
              <InfoTip>
                The state and city where your employer is based or where your work is physically performed.
              </InfoTip>
            </label>

            <div className="relative">
              <div className="relative flex items-center">
                <Briefcase size={15} className="pointer-events-none absolute left-3 text-amber-600" />
                <input
                  id="work-input"
                  type="text"
                  value={workQuery}
                  onChange={(e) => {
                    setWorkQuery(e.target.value);
                    setIsWorkOpen(true);
                  }}
                  onFocus={() => setIsWorkOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setIsWorkOpen(false);
                      const newCb = calculateCrossBorderTax({
                        residenceHometown: resQuery,
                        workHometown: workQuery,
                        annualGross,
                        filingStatus,
                      });
                      onChange({
                        residenceHometown: resQuery,
                        workHometown: workQuery,
                        isDifferentWorkLocation: true,
                        effectiveRatePct: newCb.totalRatePct,
                        isManual: false,
                      });
                    }
                  }}
                  placeholder="e.g. New York, NY or Philadelphia, PA"
                  className="w-full rounded-xl border border-line bg-white py-2 pr-8 pl-9 text-xs text-ink-1 placeholder:text-ink-3 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none"
                  autoComplete="off"
                />
                <ChevronDown
                  size={14}
                  className={`pointer-events-none absolute right-3 text-ink-3 transition-transform ${
                    isWorkOpen ? "rotate-180" : ""
                  }`}
                />
              </div>

              {/* Work Dropdown */}
              {isWorkOpen && (
                <div className="absolute z-30 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-line bg-white py-1 shadow-lg">
                  <div className="px-3 py-1.5 text-2xs font-semibold text-ink-3 uppercase tracking-wider">
                    {workQuery ? "Matching Cities" : "Popular Work Locations"}
                  </div>
                  {workSuggestions.map((c) => {
                    const full = `${c.city}, ${c.state}`;
                    const isSelected =
                      cb.work.city.toLowerCase() === c.city.toLowerCase() && cb.work.state === c.state;
                    return (
                      <button
                        key={full}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectWorkCity(c);
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-paper ${
                          isSelected ? "bg-paper/70 font-medium text-brand" : "text-ink-1"
                        }`}
                      >
                        <span>{full}</span>
                        {isSelected && <Check size={14} className="text-brand" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Commuter Presets */}
            <div className="pt-2">
              <div className="text-2xs font-semibold text-ink-3 uppercase tracking-wider">
                Popular Commuter Routes
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {COMMUTER_PRESETS.map((p) => {
                  const isPresetActive =
                    cb.residence.city.toLowerCase() === p.residence.split(",")[0].trim().toLowerCase() &&
                    cb.work.city.toLowerCase() === p.work.split(",")[0].trim().toLowerCase();
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleSelectCommuterPreset(p)}
                      title={p.tip}
                      className={`rounded-lg px-2.5 py-1 text-2xs font-medium transition-colors ${
                        isPresetActive
                          ? "bg-amber-600 text-white shadow-xs"
                          : "border border-line bg-white text-ink-2 hover:border-amber-500/50 hover:bg-amber-50/50"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Pick Pills (Single location mode) */}
      {!differentWork && (
        <div>
          <div className="text-2xs font-medium text-ink-3 uppercase tracking-wider">Quick Pick City</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {POPULAR_HOMETOWNS.slice(0, 6).map((h) => {
              const isSelected = cb.residence.hometown.toLowerCase() === h.toLowerCase();
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => {
                    const [c, s] = h.split(",").map((s) => s.trim());
                    handleSelectResidenceCity({ city: c, state: s });
                  }}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    isSelected
                      ? "bg-brand text-white shadow-xs"
                      : "border border-line bg-paper text-ink-2 hover:border-brand/40 hover:bg-white"
                  }`}
                >
                  {h}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Cross-Border Tax Analysis & Breakdown Card */}
      <div className="rounded-xl border border-line bg-paper/70 p-4 text-sm space-y-3">
        {/* Header with Route Badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-1">
              {differentWork && !cb.isSameLocation ? (
                <span className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1 text-ink-2">
                    <MapPin size={13} className="text-brand" /> {cb.residence.city}, {cb.residence.state}
                  </span>
                  <ArrowRight size={12} className="text-ink-3" />
                  <span className="flex items-center gap-1 text-amber-700">
                    <Briefcase size={13} /> {cb.work.city}, {cb.work.state}
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-ink-1">
                  <MapPin size={14} className="text-brand" /> {cb.residence.city}, {cb.residence.state}
                </span>
              )}
            </div>
            {differentWork && !cb.isSameLocation && (
              <span className="inline-block rounded-md bg-white px-2 py-0.5 text-2xs font-semibold text-ink-2 border border-line/70">
                {cb.summaryBadge}
              </span>
            )}
          </div>

          <div className="text-right">
            <span className="num text-base font-bold text-brand">
              {isManualOverride ? manualRatePct.toFixed(2) : cb.totalRatePct.toFixed(2)}%
            </span>
            <div className="text-2xs font-medium text-ink-3">
              {isManualOverride ? "Custom Total Rate" : "Effective Total Rate"}
            </div>
          </div>
        </div>

        {/* 3-Part Tax Breakdown: State + County + City */}
        <div className="grid grid-cols-3 gap-2 border-t border-line/70 pt-2.5 text-center text-xs">
          <div className="rounded-lg bg-white p-2 border border-line/50">
            <div className="text-2xs font-medium text-ink-3">
              State Tax {differentWork && !cb.isSameLocation ? "(Net)" : `(${cb.residence.state})`}
            </div>
            <div className="num font-semibold text-ink-1">{cb.effectiveStateRatePct.toFixed(2)}%</div>
          </div>
          <div className="rounded-lg bg-white p-2 border border-line/50">
            <div className="text-2xs font-medium text-ink-3">County Tax</div>
            <div className="num font-semibold text-ink-1">{cb.effectiveCountyRatePct.toFixed(2)}%</div>
          </div>
          <div className="rounded-lg bg-white p-2 border border-line/50">
            <div className="text-2xs font-medium text-ink-3">City / Local</div>
            <div className="num font-semibold text-ink-1">{cb.effectiveCityRatePct.toFixed(2)}%</div>
          </div>
        </div>

        {/* Cross-Border Explanatory Alerts */}
        {differentWork && !cb.isSameLocation ? (
          <div className="space-y-2 pt-1 text-xs">
            {/* State Reciprocity or Credit Alert */}
            <div
              className={`flex items-start gap-2 rounded-lg p-2.5 ${
                cb.hasStateReciprocity ? "bg-emerald-50 text-emerald-800" : "bg-blue-50 text-blue-800"
              }`}
            >
              {cb.hasStateReciprocity ? (
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />
              ) : (
                <CreditCard size={16} className="mt-0.5 shrink-0 text-blue-600" />
              )}
              <div className="space-y-0.5">
                <div className="font-semibold">
                  {cb.hasStateReciprocity
                    ? "State Tax Reciprocity Agreement Active"
                    : "Multi-State Credit & Commuter Rules"}
                </div>
                <div className="text-2xs leading-relaxed opacity-90">{cb.stateTaxExplanation}</div>
              </div>
            </div>

            {/* City Commuter Exemption or Surtax Alert */}
            {cb.cityTaxExplanation && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50/80 p-2 text-xs text-amber-900">
                <Info size={14} className="mt-0.5 shrink-0 text-amber-700" />
                <div className="text-2xs leading-relaxed">{cb.cityTaxExplanation}</div>
              </div>
            )}
          </div>
        ) : (
          /* Single Location Explanatory Note */
          <div className="space-y-1.5 pt-1">
            {isNycResident && (
              <div className="flex items-center gap-1.5 rounded-lg bg-blue-50/80 px-2.5 py-1.5 text-xs text-blue-700">
                <TrendingUp size={13} className="shrink-0 text-blue-600" />
                <span>
                  <b>NYC progressive brackets:</b> City tax rate updates dynamically as your gross pay changes (3.08% up to 3.88%).
                </span>
              </div>
            )}
            {cb.residence.notes && !isNycResident && (
              <div className="flex items-start gap-1.5 text-xs text-ink-3">
                <Info size={14} className="mt-0.5 shrink-0 text-brand" />
                <span>{cb.residence.notes}</span>
              </div>
            )}
          </div>
        )}

        {/* Custom Override Slider Toggle */}
        <div className="border-t border-line/70 pt-2">
          <button
            type="button"
            onClick={() => setShowOverride(!showOverride)}
            className="flex items-center gap-1.5 text-xs font-medium text-ink-2 hover:text-brand"
          >
            <SlidersHorizontal size={12} />
            <span>{showOverride ? "Hide custom rate slider" : "Need to adjust? Customize rate"}</span>
          </button>

          {showOverride && (
            <div className="mt-3 space-y-2 rounded-lg bg-white p-3 border border-line">
              <div className="flex items-center justify-between text-xs">
                <span className="text-ink-2 font-medium">Custom Total Rate</span>
                <span className="font-semibold num text-brand">{manualRatePct.toFixed(2)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={15}
                step={0.05}
                value={manualRatePct}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  onChange({
                    residenceHometown: resQuery,
                    workHometown: differentWork ? workQuery : resQuery,
                    isDifferentWorkLocation: differentWork,
                    effectiveRatePct: val,
                    isManual: true,
                  });
                }}
                className="w-full accent-brand"
              />
              <div className="flex justify-between text-2xs text-ink-3">
                <span>0% (e.g. TX/FL)</span>
                <span>5%</span>
                <span>10%+</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
