export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name_en: string
          name_fr: string | null
          parent_slug: string | null
          position: number
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name_en: string
          name_fr?: string | null
          parent_slug?: string | null
          position?: number
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name_en?: string
          name_fr?: string | null
          parent_slug?: string | null
          position?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      dispute_messages: {
        Row: {
          attachment_url: string | null
          created_at: string
          dispute_id: string
          id: string
          internal_only: boolean
          message: string
          sender_role: string
          sender_user_id: string | null
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          dispute_id: string
          id?: string
          internal_only?: boolean
          message: string
          sender_role?: string
          sender_user_id?: string | null
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          dispute_id?: string
          id?: string
          internal_only?: boolean
          message?: string
          sender_role?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_messages_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          approved_refund_amount: number
          created_at: string
          customer_id: string | null
          description: string | null
          id: string
          order_id: string
          reason: string
          requested_refund_amount: number
          resolution_note: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          updated_at: string
          vendor_id: string
          vendor_order_id: string | null
        }
        Insert: {
          approved_refund_amount?: number
          created_at?: string
          customer_id?: string | null
          description?: string | null
          id?: string
          order_id: string
          reason: string
          requested_refund_amount?: number
          resolution_note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
          vendor_id: string
          vendor_order_id?: string | null
        }
        Update: {
          approved_refund_amount?: number
          created_at?: string
          customer_id?: string | null
          description?: string | null
          id?: string
          order_id?: string
          reason?: string
          requested_refund_amount?: number
          resolution_note?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          updated_at?: string
          vendor_id?: string
          vendor_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "disputes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "public_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_vendor_order_id_fkey"
            columns: ["vendor_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dispute_id: string | null
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dispute_id?: string | null
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dispute_id?: string | null
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          carrier: string | null
          created_at: string
          id: string
          order_id: string
          product_id: string | null
          quantity: number
          status: Database["public"]["Enums"]["fulfillment_status"]
          title: string
          tracking_number: string | null
          unit_price: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          id?: string
          order_id: string
          product_id?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["fulfillment_status"]
          title: string
          tracking_number?: string | null
          unit_price?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["fulfillment_status"]
          title?: string
          tracking_number?: string | null
          unit_price?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "public_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "public_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          billing_address: Json | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_id: string | null
          customer_phone: string | null
          discount_total: number
          id: string
          order_number: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          shipping_address: Json | null
          shipping_total: number
          status: Database["public"]["Enums"]["order_status"]
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
        }
        Insert: {
          billing_address?: Json | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_phone?: string | null
          discount_total?: number
          id?: string
          order_number?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          shipping_address?: Json | null
          shipping_total?: number
          status?: Database["public"]["Enums"]["order_status"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Update: {
          billing_address?: Json | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_phone?: string | null
          discount_total?: number
          id?: string
          order_number?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          shipping_address?: Json | null
          shipping_total?: number
          status?: Database["public"]["Enums"]["order_status"]
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      payout_adjustments: {
        Row: {
          amount: number
          applied_payout_id: string | null
          created_at: string
          id: string
          kind: string
          note: string | null
          payout_id: string | null
          vendor_id: string
          vendor_order_id: string | null
        }
        Insert: {
          amount: number
          applied_payout_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          payout_id?: string | null
          vendor_id: string
          vendor_order_id?: string | null
        }
        Update: {
          amount?: number
          applied_payout_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          payout_id?: string | null
          vendor_id?: string
          vendor_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_adjustments_applied_payout_id_fkey"
            columns: ["applied_payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_adjustments_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_adjustments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "public_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_adjustments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_adjustments_vendor_order_id_fkey"
            columns: ["vendor_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_items: {
        Row: {
          commission_amount: number
          created_at: string
          gross_amount: number
          id: string
          net_amount: number
          payout_id: string
          refund_amount: number
          vendor_order_id: string
        }
        Insert: {
          commission_amount?: number
          created_at?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          payout_id: string
          refund_amount?: number
          vendor_order_id: string
        }
        Update: {
          commission_amount?: number
          created_at?: string
          gross_amount?: number
          id?: string
          net_amount?: number
          payout_id?: string
          refund_amount?: number
          vendor_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_items_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_items_vendor_order_id_fkey"
            columns: ["vendor_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_settings: {
        Row: {
          auto_transfers_enabled: boolean
          hold_days: number
          id: boolean
          updated_at: string
        }
        Insert: {
          auto_transfers_enabled?: boolean
          hold_days?: number
          id?: boolean
          updated_at?: string
        }
        Update: {
          auto_transfers_enabled?: boolean
          hold_days?: number
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      payouts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          commission_amount: number
          created_at: string
          currency: string
          dispute_hold_amount: number
          failure_reason: string | null
          gross_amount: number
          id: string
          net_amount: number
          paid_at: string | null
          period_end: string
          period_start: string
          refund_amount: number
          status: Database["public"]["Enums"]["payout_status"]
          stripe_transfer_id: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          commission_amount?: number
          created_at?: string
          currency?: string
          dispute_hold_amount?: number
          failure_reason?: string | null
          gross_amount?: number
          id?: string
          net_amount?: number
          paid_at?: string | null
          period_end: string
          period_start: string
          refund_amount?: number
          status?: Database["public"]["Enums"]["payout_status"]
          stripe_transfer_id?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          commission_amount?: number
          created_at?: string
          currency?: string
          dispute_hold_amount?: number
          failure_reason?: string | null
          gross_amount?: number
          id?: string
          net_amount?: number
          paid_at?: string | null
          period_end?: string
          period_start?: string
          refund_amount?: number
          status?: Database["public"]["Enums"]["payout_status"]
          stripe_transfer_id?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "public_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      product_import_job_rows: {
        Row: {
          created_at: string
          errors: Json
          id: string
          job_id: string
          product_id: string | null
          raw: Json
          row_index: number
          row_status: string
        }
        Insert: {
          created_at?: string
          errors?: Json
          id?: string
          job_id: string
          product_id?: string | null
          raw?: Json
          row_index: number
          row_status?: string
        }
        Update: {
          created_at?: string
          errors?: Json
          id?: string
          job_id?: string
          product_id?: string | null
          raw?: Json
          row_index?: number
          row_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_import_job_rows_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "product_import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_import_job_rows_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_import_job_rows_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "public_products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_import_jobs: {
        Row: {
          created_at: string
          errors: Json
          failed_rows: number
          file_url: string | null
          id: string
          integration_id: string | null
          owner_id: string
          provider_type: string
          source_filename: string | null
          status: string
          success_rows: number
          total_rows: number
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          errors?: Json
          failed_rows?: number
          file_url?: string | null
          id?: string
          integration_id?: string | null
          owner_id: string
          provider_type: string
          source_filename?: string | null
          status?: string
          success_rows?: number
          total_rows?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          errors?: Json
          failed_rows?: number
          file_url?: string | null
          id?: string
          integration_id?: string | null
          owner_id?: string
          provider_type?: string
          source_filename?: string | null
          status?: string
          success_rows?: number
          total_rows?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_import_jobs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "supplier_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_import_jobs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "public_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_import_jobs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_slug: string | null
          compare_at_price: number | null
          cost: number | null
          created_at: string
          description: string | null
          id: string
          images: Json
          inventory_quantity: number
          price: number
          short_description: string | null
          sku: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          supplier_product_id: string | null
          supplier_source: string | null
          supplier_url: string | null
          title: string
          track_inventory: boolean
          updated_at: string
          vendor_id: string
        }
        Insert: {
          category_slug?: string | null
          compare_at_price?: number | null
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          images?: Json
          inventory_quantity?: number
          price?: number
          short_description?: string | null
          sku?: string | null
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          supplier_product_id?: string | null
          supplier_source?: string | null
          supplier_url?: string | null
          title: string
          track_inventory?: boolean
          updated_at?: string
          vendor_id: string
        }
        Update: {
          category_slug?: string | null
          compare_at_price?: number | null
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          images?: Json
          inventory_quantity?: number
          price?: number
          short_description?: string | null
          sku?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          supplier_product_id?: string | null
          supplier_source?: string | null
          supplier_url?: string | null
          title?: string
          track_inventory?: boolean
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "public_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          country: string
          created_at: string
          display_name: string | null
          id: string
          locale: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          country?: string
          created_at?: string
          display_name?: string | null
          id: string
          locale?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          country?: string
          created_at?: string
          display_name?: string | null
          id?: string
          locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      refund_records: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          dispute_id: string | null
          failure_reason: string | null
          id: string
          order_id: string
          processed_at: string | null
          reason: string | null
          status: Database["public"]["Enums"]["refund_status"]
          stripe_refund_id: string | null
          updated_at: string
          vendor_order_id: string | null
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          dispute_id?: string | null
          failure_reason?: string | null
          id?: string
          order_id: string
          processed_at?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          stripe_refund_id?: string | null
          updated_at?: string
          vendor_order_id?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          dispute_id?: string | null
          failure_reason?: string | null
          id?: string
          order_id?: string
          processed_at?: string | null
          reason?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          stripe_refund_id?: string | null
          updated_at?: string
          vendor_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refund_records_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_records_vendor_order_id_fkey"
            columns: ["vendor_order_id"]
            isOneToOne: false
            referencedRelation: "vendor_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_event_log: {
        Row: {
          id: string
          payload: Json | null
          processed_at: string
          type: string
        }
        Insert: {
          id: string
          payload?: Json | null
          processed_at?: string
          type: string
        }
        Update: {
          id?: string
          payload?: Json | null
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      supplier_integrations: {
        Row: {
          created_at: string
          credentials_encrypted: string | null
          id: string
          owner_id: string
          provider_name: string
          provider_type: string
          settings: Json
          status: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          credentials_encrypted?: string | null
          id?: string
          owner_id: string
          provider_name: string
          provider_type: string
          settings?: Json
          status?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          credentials_encrypted?: string | null
          id?: string
          owner_id?: string
          provider_name?: string
          provider_type?: string
          settings?: Json
          status?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_integrations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "public_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_integrations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vendor_orders: {
        Row: {
          carrier: string | null
          commission_amount: number
          created_at: string
          delivered_at: string | null
          dispute_hold_amount: number
          id: string
          order_id: string
          refund_amount: number
          status: Database["public"]["Enums"]["vendor_order_status"]
          subtotal: number
          tracking_number: string | null
          updated_at: string
          vendor_id: string
          vendor_payout_amount: number
        }
        Insert: {
          carrier?: string | null
          commission_amount?: number
          created_at?: string
          delivered_at?: string | null
          dispute_hold_amount?: number
          id?: string
          order_id: string
          refund_amount?: number
          status?: Database["public"]["Enums"]["vendor_order_status"]
          subtotal?: number
          tracking_number?: string | null
          updated_at?: string
          vendor_id: string
          vendor_payout_amount?: number
        }
        Update: {
          carrier?: string | null
          commission_amount?: number
          created_at?: string
          delivered_at?: string | null
          dispute_hold_amount?: number
          id?: string
          order_id?: string
          refund_amount?: number
          status?: Database["public"]["Enums"]["vendor_order_status"]
          subtotal?: number
          tracking_number?: string | null
          updated_at?: string
          vendor_id?: string
          vendor_payout_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendor_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "public_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          banner_url: string | null
          business_name: string | null
          charges_enabled: boolean
          city: string | null
          commission_rate: number
          contact_email: string | null
          country: string
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          payouts_enabled: boolean
          phone: string | null
          postal_code: string | null
          province: string | null
          return_policy: string | null
          shipping_policy: string | null
          slug: string
          status: Database["public"]["Enums"]["vendor_status"]
          store_name: string
          stripe_connect_account_id: string | null
          stripe_connect_last_checked_at: string | null
          stripe_connect_status: string
          stripe_customer_id: string | null
          stripe_details_submitted: boolean
          stripe_subscription_id: string | null
          subscription_plan: string | null
          subscription_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          banner_url?: string | null
          business_name?: string | null
          charges_enabled?: boolean
          city?: string | null
          commission_rate?: number
          contact_email?: string | null
          country?: string
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          payouts_enabled?: boolean
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          return_policy?: string | null
          shipping_policy?: string | null
          slug: string
          status?: Database["public"]["Enums"]["vendor_status"]
          store_name: string
          stripe_connect_account_id?: string | null
          stripe_connect_last_checked_at?: string | null
          stripe_connect_status?: string
          stripe_customer_id?: string | null
          stripe_details_submitted?: boolean
          stripe_subscription_id?: string | null
          subscription_plan?: string | null
          subscription_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          banner_url?: string | null
          business_name?: string | null
          charges_enabled?: boolean
          city?: string | null
          commission_rate?: number
          contact_email?: string | null
          country?: string
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          payouts_enabled?: boolean
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          return_policy?: string | null
          shipping_policy?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["vendor_status"]
          store_name?: string
          stripe_connect_account_id?: string | null
          stripe_connect_last_checked_at?: string | null
          stripe_connect_status?: string
          stripe_customer_id?: string | null
          stripe_details_submitted?: boolean
          stripe_subscription_id?: string | null
          subscription_plan?: string | null
          subscription_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_products: {
        Row: {
          category_slug: string | null
          compare_at_price: number | null
          created_at: string | null
          description: string | null
          id: string | null
          images: Json | null
          inventory_quantity: number | null
          price: number | null
          short_description: string | null
          slug: string | null
          status: Database["public"]["Enums"]["product_status"] | null
          title: string | null
          track_inventory: boolean | null
          updated_at: string | null
          vendor_id: string | null
        }
        Insert: {
          category_slug?: string | null
          compare_at_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          images?: Json | null
          inventory_quantity?: number | null
          price?: number | null
          short_description?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["product_status"] | null
          title?: string | null
          track_inventory?: boolean | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Update: {
          category_slug?: string | null
          compare_at_price?: number | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          images?: Json | null
          inventory_quantity?: number | null
          price?: number | null
          short_description?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["product_status"] | null
          title?: string | null
          track_inventory?: boolean | null
          updated_at?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "public_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      public_vendors: {
        Row: {
          banner_url: string | null
          country: string | null
          created_at: string | null
          description: string | null
          id: string | null
          logo_url: string | null
          return_policy: string | null
          shipping_policy: string | null
          slug: string | null
          status: Database["public"]["Enums"]["vendor_status"] | null
          store_name: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          banner_url?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          logo_url?: string | null
          return_policy?: string | null
          shipping_policy?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["vendor_status"] | null
          store_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          banner_url?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          logo_url?: string | null
          return_policy?: string | null
          shipping_policy?: string | null
          slug?: string | null
          status?: Database["public"]["Enums"]["vendor_status"] | null
          store_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_access_dispute: {
        Args: { _dispute_id: string; _user_id: string }
        Returns: boolean
      }
      get_vendor_commission_rates: {
        Args: { _vendor_ids: string[] }
        Returns: {
          commission_rate: number
          id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lookup_guest_order: { Args: { _order_number: string }; Returns: Json }
      owns_vendor: {
        Args: { _user_id: string; _vendor_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "vendor" | "customer"
      dispute_status:
        | "open"
        | "under_review"
        | "waiting_customer"
        | "waiting_vendor"
        | "resolved_customer"
        | "resolved_vendor"
        | "rejected"
        | "cancelled"
      fulfillment_status:
        | "pending"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
      order_status:
        | "pending"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "refunded"
      payment_status:
        | "unpaid"
        | "paid"
        | "refunded"
        | "failed"
        | "processing"
        | "partially_refunded"
      payout_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "processing"
        | "paid"
        | "failed"
        | "held"
        | "cancelled"
      product_status:
        | "draft"
        | "pending_review"
        | "active"
        | "rejected"
        | "archived"
      refund_status:
        | "requested"
        | "approved"
        | "processing"
        | "refunded"
        | "failed"
        | "cancelled"
      vendor_order_status:
        | "pending"
        | "accepted"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
      vendor_status: "pending" | "active" | "suspended" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "vendor", "customer"],
      dispute_status: [
        "open",
        "under_review",
        "waiting_customer",
        "waiting_vendor",
        "resolved_customer",
        "resolved_vendor",
        "rejected",
        "cancelled",
      ],
      fulfillment_status: [
        "pending",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ],
      order_status: [
        "pending",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      payment_status: [
        "unpaid",
        "paid",
        "refunded",
        "failed",
        "processing",
        "partially_refunded",
      ],
      payout_status: [
        "draft",
        "pending_review",
        "approved",
        "processing",
        "paid",
        "failed",
        "held",
        "cancelled",
      ],
      product_status: [
        "draft",
        "pending_review",
        "active",
        "rejected",
        "archived",
      ],
      refund_status: [
        "requested",
        "approved",
        "processing",
        "refunded",
        "failed",
        "cancelled",
      ],
      vendor_order_status: [
        "pending",
        "accepted",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ],
      vendor_status: ["pending", "active", "suspended", "rejected"],
    },
  },
} as const
