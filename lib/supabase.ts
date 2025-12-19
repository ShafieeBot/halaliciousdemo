
import { createClient } from '@supabase/supabase-js'

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            places: {
                Row: {
                    id: string
                    created_at: string
                    place_id: string | null
                    name: string
                    halal_status: string | null
                    address: string | null
                    city: string | null
                    country: string | null
                    lat: number | null
                    lng: number | null
                    plus_code: string | null
                    phone: string | null
                    website_url: string | null
                    google_maps_url: string | null
                    cuisine_category: string | null
                    cuisine_subtype: string | null
                    price_level: string | null
                    opening_hours: Json | null
                    tags: string[] | null
                }
                Insert: {
                    id?: string
                    created_at?: string
                    place_id?: string | null
                    name: string
                    halal_status?: string | null
                    address?: string | null
                    city?: string | null
                    country?: string | null
                    lat?: number | null
                    lng?: number | null
                    plus_code?: string | null
                    phone?: string | null
                    website_url?: string | null
                    google_maps_url?: string | null
                    cuisine_category?: string | null
                    cuisine_subtype?: string | null
                    price_level?: string | null
                    opening_hours?: Json | null
                    tags?: string[] | null
                }
                Update: {
                    id?: string
                    created_at?: string
                    place_id?: string | null
                    name?: string
                    halal_status?: string | null
                    address?: string | null
                    city?: string | null
                    country?: string | null
                    lat?: number | null
                    lng?: number | null
                    plus_code?: string | null
                    phone?: string | null
                    website_url?: string | null
                    google_maps_url?: string | null
                    cuisine_category?: string | null
                    cuisine_subtype?: string | null
                    price_level?: string | null
                    opening_hours?: Json | null
                    tags?: string[] | null
                }
            }
        }
    }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
