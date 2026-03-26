import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PartyMemberList } from '~/components/campaign/PartyMemberList'

const twoMembers = [
  { id: '1', characterName: 'Thalion', characterClass: 'Ranger', avatar: null, userId: 'u1' },
  { id: '2', characterName: 'Lyra', characterClass: 'Wizard', avatar: null, userId: 'u2' },
]

describe('PartyMemberList', () => {
  it('renders all party members', () => {
    render(<PartyMemberList members={twoMembers} maxPlayers={4} />)
    expect(screen.getByText('Thalion')).toBeInTheDocument()
    expect(screen.getByText('Lyra')).toBeInTheDocument()
  })

  it('renders open slot chips for remaining capacity', () => {
    render(<PartyMemberList members={twoMembers} maxPlayers={4} />)
    const openSlots = screen.getAllByText('OPEN SLOT')
    expect(openSlots).toHaveLength(2)
  })

  it('renders no open slots when party is full', () => {
    render(<PartyMemberList members={twoMembers} maxPlayers={2} />)
    expect(screen.queryByText('OPEN SLOT')).not.toBeInTheDocument()
  })

  it('renders nothing when members is empty and maxPlayers is 0', () => {
    const { container } = render(<PartyMemberList members={[]} maxPlayers={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('caps at 10 party members', () => {
    const tenPlusMembers = Array.from({ length: 12 }, (_, i) => ({
      id: String(i),
      characterName: `Hero ${i + 1}`,
      characterClass: 'Fighter',
      avatar: null,
      userId: `u${i}`,
    }))
    render(<PartyMemberList members={tenPlusMembers} maxPlayers={12} />)
    const chips = screen.getAllByText(/Hero \d+/)
    expect(chips).toHaveLength(10)
  })

  it('shows PARTY label', () => {
    render(<PartyMemberList members={twoMembers} maxPlayers={4} />)
    expect(screen.getByText('PARTY')).toBeInTheDocument()
  })
})
