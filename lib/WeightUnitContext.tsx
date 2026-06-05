import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

type WeightUnit = 'kg' | 'lbs'

interface WeightUnitContextValue {
    unit: WeightUnit
    toDisplay: (kg: number) => number
    toKg: (value: number) => number
    formatWeight: (kg: number) => string
    setUnit: (unit: WeightUnit) => void
}

const WeightUnitContext = createContext<WeightUnitContextValue>({
    unit: 'kg',
    toDisplay: (kg) => kg,
    toKg: (value) => value,
    formatWeight: (kg) => `${kg}kg`,
    setUnit: () => { },
})
export function WeightUnitProvider({ children }: { children: React.ReactNode }) {
    const [unit, setUnit] = useState<WeightUnit>('kg')

    useEffect(() => {
        async function fetchUnit() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data } = await supabase
                .from('profiles')
                .select('weight_unit')
                .eq('id', user.id)
                .single()
            if (data?.weight_unit) setUnit(data.weight_unit)
        }
        fetchUnit()

        // Re-fetch when auth state changes (login/logout)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
            fetchUnit()
        })
        return () => subscription.unsubscribe()
    }, [])

    function toDisplay(kg: number): number {
        if (unit === 'lbs') return Math.round(kg * 2.205 * 10) / 10
        return kg
    }

    function toKg(value: number): number {
        if (unit === 'lbs') return Math.round((value / 2.205) * 10) / 10
        return value
    }

    function formatWeight(kg: number): string {
        const display = toDisplay(kg)
        return `${display}${unit}`
    }

    return (
        <WeightUnitContext.Provider value={{ unit, toDisplay, toKg, formatWeight, setUnit }}>
            {children}
        </WeightUnitContext.Provider>
    )
}

export function useWeightUnit() {
    return useContext(WeightUnitContext)
}