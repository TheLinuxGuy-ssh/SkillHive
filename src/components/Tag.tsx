interface Props {
    children: string
}

const Tag = ({children}: Props) => {
    return (
        <>
            <div className="bg-white/5 w-max px-4 py-2 m-1 rounded-2xl border-1 border-transparent hover:border-[#fffd01] cursor-pointer transition duration-300 ease-in-out">
                {children}
            </div>
        </>
    )
}

export default Tag