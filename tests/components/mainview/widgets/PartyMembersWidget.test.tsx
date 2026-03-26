import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PartyMembersWidget } from '~/components/mainview/widgets/PartyMembersWidget'
import { getPartyMembers } from '~/services/mocks/partyMembersService'

describe('PartyMembersWidget', () => {
  it('renders the widget title', () => {
    render(<PartyMembersWidget members={[]} />)

    expect(screen.getByText('Party Members')).toBeInTheDocument()
  })

  it('renders all party member names', async () => {
    const members = await getPartyMembers()

    render(<PartyMembersWidget members={members} />)

    for (const member of members) {
      expect(screen.getByText(member.name)).toBeInTheDocument()
    }
  })

  it('shows class and race for each member', async () => {
    const members = await getPartyMembers()

    render(<PartyMembersWidget members={members} />)

    for (const member of members) {
      expect(screen.getByText(member.characterClass)).toBeInTheDocument()
      expect(screen.getByText(member.race)).toBeInTheDocument()
    }
  })

  it('shows the empty state when members is empty', () => {
    render(<PartyMembersWidget members={[]} />)

    expect(screen.getByText('No party members found')).toBeInTheDocument()
  })
})
