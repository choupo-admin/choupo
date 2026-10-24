! ======================================================================
! This subroutines implements the Nelder-Mead simplex method. 
! * Copyright (c) 1998-2004 <Michael F. Hutt>
! Michael F. Hutt
! http://www.mikehutt.com
! Mar. 17, 1998
! *
! * Permission is hereby granted, free of charge, to any person obtaining
! * a copy of this software and associated documentation files (the
! * "Software"), to deal in the Software without restriction, including
! * without limitation the rights to use, copy, modify, merge, publish,
! * distribute, sublicense, and/or sell copies of the Software, and to
! * permit persons to whom the Software is furnished to do so, subject to
! * the following conditions:
! *
! * The above copyright notice and this permission notice shall be
! * included in all copies or substantial portions of the Software.
! *
! * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
! * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
! * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
! * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
! * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
! * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
! * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
! ======================================================================
! This is the simplex routine
	Subroutine SIMPLEX(start, n, EPSILON,FUNC,ITER)
	IMPLICIT DOUBLE PRECISION (A-H,O-Z)
	Integer n
	REAL*8 start(0:n-1), EPSILON, FUNC

! Define Constants
	Parameter(ALPHA=1.0)
	Parameter(BETA=0.5)
	Parameter(GAMMA=2.0)
	Parameter(MATSIZ=20)
	Parameter(matsz1=matsiz+1)
	EXTERNAL func
! ======================================================================
! Variable Definitions
! START = VECTOR WITH INICIAL VALUES OF THE OPTIMIZATION VARIABLES
! N = NUMBER OF OPTIMIZATION VARIABLES
! EPSILON = CONVERGENCE CRITERIA PARAMETER
! ITER = MAXIMUM NUMBER OF ITERATIONS (INPUT) / NUMBER OF ITERATIONS (OUTPUT)
! FUNC = EXTERNAL OBJECTIVE FUNCTION
! 
! Integer vs = vertex with the smallest value
! Integer vh = vertex with next smallest value 
! Integer vg = vertex with largest value 
! Integer i,j,m,row
! Integer k = track the number of function evaluations 
! Integer itr = track the number of iterations
! Real v = holds vertices of simplex 
! Real pn,qn = values used to create initial simplex 
! Real f = value of function at each vertex 
! Real fr = value of function at reflection point 
! Real fe = value of function at expansion point 
! Real fc = value of function at contraction point 
! Real vr = reflection - coordinates 
! Real ve = expansion - coordinates 
! Real vc = contraction - coordinates 
! Real vm = centroid - coordinates 
! Real min
! Real fsum,favg,s,cent
! Real vtmp = temporary array passed to FUNC
! ======================================================================

	Integer vs,vh,vg
	Integer i,j,k,itr,row
	
	REAL*8 v(0:MATSIZ,0:MATSIZ-1)
	REAL*8 pn,qn
	REAL*8 f(0:MATSIZ)
	REAL*8 fr,fe,fc
	REAL*8 vr(0:MATSIZ-1)
	REAL*8 ve(0:MATSIZ-1)
	REAL*8 vc(0:MATSIZ-1)
	REAL*8 vm(0:MATSIZ-1)
	REAL*8 vtmp(0:MATSIZ-1)
	REAL*8 min,fsum,favg,cent,s

! Initialize matrices to 0.0 

	Data f/matsz1 * 0.0/
	Data vr/MATSIZ * 0.0/
	Data ve/MATSIZ * 0.0/
	Data vc/MATSIZ * 0.0/
	Data vm/MATSIZ * 0.0/
	Data vtmp/MATSIZ * 0.0/

C     ASSIGN MAXIMUM NUMBER OF ITERATIONS
	MAX_IT = ITER

! create the initial simplex
! assume one of the vertices is 0.0

	pn = (sqrt(n+1.)-1.+n)/(n*sqrt(2.))
	qn = (sqrt(n+1.)-1.)/(n*sqrt(2.))
							
	Do 10 i=0,n-1
		v(0,i) = start(i)
10	Continue

	Do 20 i=1,n
		Do 30 j=0,n-1
			If (i-1 .EQ. j) Then
				v(i,j) = pn+start(j)
			Else
				v(i,j) = qn+start(j)
			EndIf
30		Continue
20	Continue


! find the initial function values

	Do 40 j=0,n
!		put coordinates into single dimension array
!		to pass it to FUNC
		Do 45 m=0,n-1
			vtmp(m) = v(j,m)
45		Continue
		f(j) = FUNC(vtmp)
40	Continue

	k = n+1

! begin main loop of the minimization

	Do 50 itr=1,MAX_IT
!		find the index of the largest value
		vg = 0
		Do 60 j=0,n
			If (f(j) .GT. f(vg)) Then
				vg = j
			EndIf
60		Continue

!		find the index of the smallest value
		vs = 0
		Do 70 j=0,n
			If (f(j) .LT. f(vs)) Then
				vs = j
			EndIf
70		Continue

!		find the index of the second largest value
		vh = vs
		Do 80 j=0,n
			If ((f(j) .GT. f(vh)) .AND. (f(j) .LT. f(vg))) Then
				vh = j
			EndIf
80		Continue

!		calculate the centroid
		Do 90 j=0,n-1
			cent = 0.0
			Do 100 m=0,n
				If (m .NE. vg) Then
					cent = cent + v(m,j)
				EndIf
100			Continue
			vm(j) = cent/n
90		Continue

!		reflect vg to new vertex vr
		Do 110 j=0,n-1
			vr(j) = (1+ALPHA)*vm(j) - ALPHA*v(vg,j)
110		Continue
		
		fr = FUNC(vr)
		k = k+1

		If ((fr .LE. f(vh)) .AND. (fr .GT. f(vs))) Then
			Do 120 j=0,n-1
				v(vg,j) = vr(j)
120			Continue
			f(vg) = fr
		EndIf

!		investigate a step further in this direction
		If (fr .LE. f(vs)) Then
			Do 130 j=0,n-1
				ve(j) = GAMMA*vr(j) + (1-GAMMA)*vm(j)
130			Continue
			fe = FUNC(ve)
			k = k+1

			If (fe .LT. fr) Then
				Do 140 j=0,n-1
					v(vg,j) = ve(j)
140				Continue
				f(vg) = fe
			Else
				Do 150 j=0,n-1
					v(vg,j) = vr(j)
150				Continue
				f(vg) = fr
			EndIf
		EndIf

!		check to see if a contraction is necessary
		If (fr .GT. f(vh)) Then
			Do 160 j=0,n-1
				vc(j) = BETA*v(vg,j) + (1-BETA)*vm(j)
160			Continue
			fc = FUNC(vc)
			k = k+1
			If (fc .LT. f(vg)) Then
				Do 170 j=0,n-1
					v(vg,j) = vc(j)
170 				Continue
				f(vg) = fc
			

!			at this point the contraction is not successful,
!			we must halve the distance from vs to all the
!			vertices of the simplex and then continue.
!			10/31/97 - modified C program to account for 
!			all vertices,

			Else
				Do 180 row=0,n
					If (row .NE. vs) Then
						Do 190 j=0,n-1
							v(row,j) = v(vs,j)+(v(row,j)-v(vs,j))/2.0
190						Continue
					EndIf
180				Continue
				Do 185 m=0,n-1
					vtmp(m) = v(vg,m)
185				Continue
				f(vg) = FUNC(vtmp)
				k = k+1

				Do 187 m=0,n-1
					vtmp(m) = v(vh,m)
187				Continue
				f(vh) = FUNC(vtmp)
				k = k+1
			EndIf
		EndIf

!		test for convergence
		fsum = 0.0
		Do 200 j=0,n
			fsum = fsum + f(j)
200		Continue
		favg = fsum/(n+1.)
		s = 0.0
		Do 210 j=0,n
			s = s + ((f(j)-favg)**2.)/n
210		Continue
		s = sqrt(s)
		If (s .LT. EPSILON) Then
			GO TO 220
		EndIf
50	Continue
! 	end main loop of the minimization
!	find the index of the smallest value
220	vs = 0
	Do 230 j=0,n
		If (f(j) .LT. f(vs)) Then
			vs = j
		EndIf
230	Continue

!	print out the minimum

	Do 240 m=0,n-1
		vtmp(m) = v(vs,m)
            start(m)=vtmp(m)
240	Continue

	min = FUNC(vtmp)
	k = k+1
C     ASSIGN NUMBER OF ITERATIONS FOR OUTPUT
	ITER=ITR

250	FORMAT(A29,F7.4)
300	FORMAT(F11.6,F11.6,F11.6)


      RETURN
      END


