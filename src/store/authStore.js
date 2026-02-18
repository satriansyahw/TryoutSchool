import { create } from 'zustand'
import { supabase } from '../lib/supabase'

const useAuthStore = create((set) => ({
    user: null,
    profile: null,
    loading: true,

    initializeAuth: async () => {
        set({ loading: true })

        try {
            const { data: { session }, error } = await supabase.auth.getSession()
            if (error) throw error

            if (session?.user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single()
                set({ user: session.user, profile, loading: false })
            } else {
                set({ user: null, profile: null, loading: false })
            }
        } catch (err) {
            console.error('Auth initialization error:', err)
            set({ user: null, profile: null, loading: false })
        }

        // Listen for auth state changes (login, logout, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session?.user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single()
                set({ user: session.user, profile, loading: false })
            } else {
                set({ user: null, profile: null, loading: false })
            }
        })

        // Return unsubscribe function (call this on app unmount if needed)
        return () => subscription.unsubscribe()
    },

    signIn: async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        return data
    },

    signOut: async () => {
        const { error } = await supabase.auth.signOut()
        if (error) throw error
        set({ user: null, profile: null })
    },
}))

export default useAuthStore
