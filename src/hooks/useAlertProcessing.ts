import { useEffect, useRef } from 'react';

import { clearAlertCooldowns, processAlerts } from '../services/AlertService';

import type { RawCombatData, AlertSettings } from '../types';

/**
 * Hook to process alerts when combat data changes
 */
export function useAlertProcessing(
  combatData: RawCombatData | null,
  alertSettings: AlertSettings,
  playerName: string,
  inMojitoPackage: boolean,
  epoch: number | undefined
): void {
  const previousCombatDataRef = useRef<RawCombatData | null>(null);

  const previousEpoch = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (inMojitoPackage) {
      if (epoch === undefined) return;
      if (previousEpoch.current !== epoch) {
        previousEpoch.current = epoch;
        previousCombatDataRef.current = combatData;
        clearAlertCooldowns();
        return;
      }
    }
    if (!combatData) {
      // Check for encounter end (had data, now null)
      if (!inMojitoPackage && previousCombatDataRef.current) {
        processAlerts(
          alertSettings,
          previousCombatDataRef.current,
          playerName,
          previousCombatDataRef.current,
          false,
          true // isEncounterEnd
        );
      }
      previousCombatDataRef.current = null;
      return;
    }

    // Determine if this is an encounter start
    const wasActive = previousCombatDataRef.current?.isActive === 'true';
    const isActive = combatData.isActive === 'true';
    const isEncounterStart = !wasActive && isActive;
    const isEncounterEnd = wasActive && !isActive;

    // Process alerts
    processAlerts(
      alertSettings,
      combatData,
      playerName,
      previousCombatDataRef.current,
      isEncounterStart,
      isEncounterEnd,
      inMojitoPackage
    );

    // Update ref for next comparison
    previousCombatDataRef.current = combatData;
  }, [combatData, alertSettings, playerName, inMojitoPackage, epoch]);
}
