import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // service role, not anon key
)

async function main() {
  const accounts = [
    { email: 'mankindofabigdeal@gmail.com', password: 'rowly' },
    { email: 'rowlystudios+client@gmail.com', password: 'rowly' },
  ]

  for (const { email, password } of accounts) {
    const { data: { users }, error: findError } =
      await supabase.auth.admin.listUsers()

    if (findError) {
      console.error('Error listing users:', findError.message)
      continue
    }

    const user = users.find((u) => u.email === email)

    if (!user) {
      console.error(`User not found: ${email}`)
      continue
    }

    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
    })

    if (error) {
      console.error(`Failed for ${email}:`, error.message)
    } else {
      console.log(`\u2713 Password set for ${email}`)
    }
  }
}

main()
